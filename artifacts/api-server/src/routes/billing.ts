import { Router, type IRouter } from "express";
import {
  db, subscriptionsTable, subscriptionPlansTable, tenantsTable,
  bankAccountSettingsTable, bankTransferProofsTable,
} from "@workspace/db";
import { recordResellerCommission } from "./reseller";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { getSetting } from "./settings";

const router: IRouter = Router();

/* ─── PayPal helpers ─── */
const PAYPAL_BASE =
  process.env["PAYPAL_ENV"] === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getPayPalToken(): Promise<string> {
  const clientId = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!clientId || !secret) throw new Error("PayPal credentials not configured");

  const resp = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!resp.ok) throw new Error(`PayPal auth failed: ${resp.statusText}`);
  const data = await resp.json() as { access_token: string };
  return data.access_token;
}

/* ─── PowerTranz helpers ─── */
async function getPowerTranzConfig() {
  const spId = (await getSetting("powertranz_spid", 0)) || process.env["POWERTRANZ_SPID"] || "";
  const spPassword = (await getSetting("powertranz_sppassword", 0)) || process.env["POWERTRANZ_SPPASSWORD"] || "";
  const env = (await getSetting("powertranz_env", 0)) || process.env["POWERTRANZ_ENV"] || "staging";
  const enabled = (await getSetting("powertranz_enabled", 0)) || "true";
  const base = env === "production" ? "https://gateway.ptranz.com" : "https://staging.ptranz.com";
  return { spId, spPassword, base, enabled: enabled === "true" };
}

function getTenantFromAuth(req: { headers: { authorization?: string } }) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

/* ─── PayPal: Create Order ─── */
const CreatePayPalOrderBody = z.object({
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "annual"]),
});

router.post("/billing/paypal/create-order", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreatePayPalOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;

  try {
    const token = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          description: `NEXXUS POS — ${plan.name} (${parsed.data.billingCycle})`,
          amount: { currency_code: "USD", value: amount.toFixed(2) },
          custom_id: `${tenant.tenantId}:${plan.id}:${parsed.data.billingCycle}`,
        }],
        application_context: { brand_name: "NEXXUS POS", user_action: "PAY_NOW" },
      }),
    });

    if (!resp.ok) { const err = await resp.text(); throw new Error(`PayPal error: ${err}`); }
    const order = await resp.json() as { id: string };
    res.json({ orderId: order.id, amount, plan: { name: plan.name, slug: plan.slug } });
  } catch (err) {
    res.status(500).json({ error: "Failed to create PayPal order", details: String(err) });
  }
});

/* ─── PayPal: Capture Order ─── */
const CapturePayPalOrderBody = z.object({
  orderId: z.string(),
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "annual"]),
});

router.post("/billing/paypal/capture-order", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CapturePayPalOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  try {
    const ppToken = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${parsed.data.orderId}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ppToken}` },
    });

    if (!resp.ok) { const err = await resp.text(); throw new Error(`PayPal capture error: ${err}`); }
    const captured = await resp.json() as { id: string; status: string };

    if (captured.status === "COMPLETED") {
      const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now);
        if (parsed.data.billingCycle === "annual") { periodEnd.setFullYear(periodEnd.getFullYear() + 1); }
        else { periodEnd.setMonth(periodEnd.getMonth() + 1); }

        const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;

        const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
        if (existing) {
          await db.update(subscriptionsTable).set({
            planId: plan.id, status: "active", provider: "paypal", providerOrderId: captured.id,
            billingCycle: parsed.data.billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd, updatedAt: now,
          }).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
        } else {
          await db.insert(subscriptionsTable).values({
            tenantId: tenant.tenantId, planId: plan.id, status: "active", provider: "paypal",
            providerOrderId: captured.id, billingCycle: parsed.data.billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd,
          });
        }
        await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, tenant.tenantId));
        await recordResellerCommission(tenant.tenantId, plan.id, amount);
      }
    }

    res.json({ status: captured.status, orderId: captured.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to capture PayPal payment", details: String(err) });
  }
});

/* ─── PowerTranz: Pending 3DS Store (in-memory, 10-min TTL) ─── */
interface Pending3DS {
  tenantId: number; planId: number; billingCycle: string; amount: number; planName: string;
  status: "pending" | "approved" | "declined";
  txId?: string; rrn?: string; message?: string;
}
const pending3DS = new Map<string, Pending3DS>();

async function activateSubscription(tenantId: number, planId: number, billingCycle: string, txId?: string) {
  const now = new Date(); const periodEnd = new Date(now);
  if (billingCycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);
  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenantId));
  if (existing) {
    await db.update(subscriptionsTable).set({
      planId, status: "active", provider: "powertranz", providerOrderId: txId,
      billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd, updatedAt: now,
    }).where(eq(subscriptionsTable.tenantId, tenantId));
  } else {
    await db.insert(subscriptionsTable).values({
      tenantId, planId, status: "active", provider: "powertranz",
      providerOrderId: txId, billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd,
    });
  }
  await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, tenantId));
}

async function callPowerTranz(endpoint: string, body: object): Promise<{ raw: string; status: number; data: Record<string, unknown> }> {
  const { spId, spPassword, base } = await getPowerTranzConfig();
  const resp = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json",
      "PowerTranz-PowerTranzId": spId,
      "PowerTranz-PowerTranzPassword": spPassword,
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  console.log(`[PowerTranz] ${endpoint} HTTP ${resp.status}:`, raw.slice(0, 600));
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw); } catch { /* non-JSON */ }
  return { raw, status: resp.status, data };
}

/* ─── PowerTranz: Initiate Payment (Step 1 of 3DS flow) ─── */
const PowerTranzBody = z.object({
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "annual"]),
  cardNumber: z.string(),
  cardExpiry: z.string(),
  cardCvv: z.string(),
  cardholderName: z.string(),
  returnUrl: z.string().url(),
});

router.post("/billing/powertranz/initiate", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PowerTranzBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const { spId, spPassword, enabled } = await getPowerTranzConfig();
  if (!spId || !spPassword) { res.status(503).json({ error: "PowerTranz not configured. Add credentials in Superadmin → Gateway Settings." }); return; }
  if (!enabled) { res.status(503).json({ error: "PowerTranz card payments are currently disabled." }); return; }

  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  const [mm, yy] = parsed.data.cardExpiry.split("/").map((s) => s.trim());
  const expiryDate = `${yy}${mm}`;
  const origin = new URL(parsed.data.returnUrl).origin;
  const merchantResponseUrl = `${origin}/api/billing/powertranz/3ds-callback`;

  try {
    const txId = crypto.randomUUID();
    const { data } = await callPowerTranz("/api/spi/sale", {
      TransactionIdentifier: txId,
      TotalAmount: Number(amount),
      CurrencyCode: "840",
      ThreeDSecure: true,
      Source: {
        CardPan: parsed.data.cardNumber.replace(/\s/g, ""),
        CardSecurityCode: parsed.data.cardCvv,
        CardExpiration: expiryDate,
        CardholderName: parsed.data.cardholderName,
      },
      OrderIdentifier: `NXPOS-${tenant.tenantId}-${Date.now()}`,
      ExtendedData: {
        ThreeDSecure: {
          ChallengeWindowSize: 4,
          MerchantResponseURL: merchantResponseUrl,
          ChallengeIndicator: "01",
        },
      },
    });

    const isoCode = data.IsoResponseCode as string | undefined;
    const spiToken = data.SpiToken as string | undefined;

    // SP4 = 3DS flow initiated — return SpiToken + RedirectData to frontend
    if (isoCode === "SP4" && spiToken && data.RedirectData) {
      pending3DS.set(spiToken, {
        tenantId: tenant.tenantId, planId: plan.id,
        billingCycle: parsed.data.billingCycle, amount: Number(amount),
        planName: plan.name, status: "pending",
      });
      setTimeout(() => pending3DS.delete(spiToken!), 10 * 60 * 1000);
      res.json({ step: "3ds", spiToken, redirectData: data.RedirectData });
      return;
    }

    // Direct approval (frictionless)
    if (data.Approved) {
      await activateSubscription(tenant.tenantId, plan.id, parsed.data.billingCycle, data.TransactionIdentifier as string);
      await recordResellerCommission(tenant.tenantId, plan.id, amount);
      res.json({ step: "approved", approved: true, transactionId: data.TransactionIdentifier, rrn: data.RrN, authCode: data.AuthorizationCode });
      return;
    }

    // Declined / validation error
    const errors = data.Errors as Array<{ Code: string; Message: string }> | undefined;
    res.json({
      step: "declined", approved: false,
      responseCode: isoCode ?? data.ResponseCode ?? "unknown",
      responseMessage: (data.ResponseMessage as string) ?? errors?.[0]?.Message ?? "Payment declined",
    });
  } catch (err) {
    console.error("[PowerTranz] initiate error:", err);
    res.status(500).json({ error: "PowerTranz request failed", details: String(err) });
  }
});

/* ─── PowerTranz: 3DS Callback (iframe redirect target, Step 2) ─── */
router.post("/billing/powertranz/3ds-callback", async (req, res): Promise<void> => {
  console.log("[PowerTranz 3DS callback] body keys:", Object.keys(req.body || {}));
  const spiToken = (req.body?.SpiToken ?? req.body?.spiToken ?? req.query?.SpiToken ?? req.query?.spiToken) as string | undefined;

  const closeScript = (status: string, message: string, extra = "") =>
    `<html><body><script>try{window.top.postMessage({type:"POWERTRANZ_3DS",status:${JSON.stringify(status)},message:${JSON.stringify(message)}${extra}},"*");}catch(e){}</script><p>${message}</p></body></html>`;

  if (!spiToken) { res.send(closeScript("error", "No SpiToken received. Please try again.")); return; }

  const pending = pending3DS.get(spiToken);
  if (!pending) { res.send(closeScript("error", "Transaction expired or not found. Please try again.")); return; }

  try {
    const { data } = await callPowerTranz("/api/spi/payment", { SpiToken: spiToken });

    if (data.Approved) {
      await activateSubscription(pending.tenantId, pending.planId, pending.billingCycle, data.TransactionIdentifier as string);
      await recordResellerCommission(pending.tenantId, pending.planId, pending.amount);
      pending3DS.set(spiToken, { ...pending, status: "approved", txId: data.TransactionIdentifier as string, rrn: data.RrN as string });
      setTimeout(() => pending3DS.delete(spiToken), 5 * 60 * 1000);
      const rrn = data.RrN ? ` · RRN: ${data.RrN}` : "";
      res.send(closeScript("approved", `Payment approved!${rrn}`, `,planName:${JSON.stringify(pending.planName)}`));
    } else {
      const msg = (data.ResponseMessage as string) ?? "Payment was declined";
      pending3DS.set(spiToken, { ...pending, status: "declined", message: msg });
      res.send(closeScript("declined", msg, `,responseCode:${JSON.stringify(data.IsoResponseCode ?? data.ResponseCode ?? "")}`));
    }
  } catch (err) {
    console.error("[PowerTranz] 3ds-callback error:", err);
    pending3DS.set(spiToken, { ...pending, status: "declined", message: String(err) });
    res.send(closeScript("error", "Payment processing error. Please try again."));
  }
});

/* ─── PowerTranz: 3DS Status Poll ─── */
router.get("/billing/powertranz/3ds-status", (req, res) => {
  const spiToken = req.query.spiToken as string;
  const p = pending3DS.get(spiToken);
  if (!p) { res.json({ status: "not_found" }); return; }
  res.json({ status: p.status, planName: p.planName, rrn: p.rrn, message: p.message });
});

/* ─── Bank Accounts (public for tenants) ─── */
router.get("/billing/bank-accounts", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const accounts = await db.select({
    id: bankAccountSettingsTable.id,
    accountHolder: bankAccountSettingsTable.accountHolder,
    bankName: bankAccountSettingsTable.bankName,
    accountNumber: bankAccountSettingsTable.accountNumber,
    routingNumber: bankAccountSettingsTable.routingNumber,
    iban: bankAccountSettingsTable.iban,
    swiftCode: bankAccountSettingsTable.swiftCode,
    currency: bankAccountSettingsTable.currency,
    instructions: bankAccountSettingsTable.instructions,
    sortOrder: bankAccountSettingsTable.sortOrder,
  }).from(bankAccountSettingsTable)
    .where(eq(bankAccountSettingsTable.isActive, true))
    .orderBy(bankAccountSettingsTable.sortOrder);

  res.json(accounts);
});

/* ─── Submit Bank Transfer Proof ─── */
const BankTransferBody = z.object({
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "annual"]),
  bankAccountId: z.number(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  proofFileName: z.string().optional(),
  proofFileType: z.string().optional(),
  proofFileData: z.string().optional(),
});

router.post("/billing/bank-transfer", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = BankTransferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;

  const [proof] = await db.insert(bankTransferProofsTable).values({
    tenantId: tenant.tenantId,
    planId: plan.id,
    bankAccountId: parsed.data.bankAccountId,
    billingCycle: parsed.data.billingCycle,
    amount,
    referenceNumber: parsed.data.referenceNumber,
    notes: parsed.data.notes,
    proofFileName: parsed.data.proofFileName,
    proofFileType: parsed.data.proofFileType,
    proofFileData: parsed.data.proofFileData,
    status: "pending",
  }).returning();

  res.status(201).json({ success: true, proofId: proof.id });
});

/* ─── Get tenant's own proofs ─── */
router.get("/billing/bank-transfer/my-proofs", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const proofs = await db.select({
    id: bankTransferProofsTable.id,
    planId: bankTransferProofsTable.planId,
    billingCycle: bankTransferProofsTable.billingCycle,
    amount: bankTransferProofsTable.amount,
    referenceNumber: bankTransferProofsTable.referenceNumber,
    proofFileName: bankTransferProofsTable.proofFileName,
    status: bankTransferProofsTable.status,
    reviewNotes: bankTransferProofsTable.reviewNotes,
    createdAt: bankTransferProofsTable.createdAt,
    planName: subscriptionPlansTable.name,
  }).from(bankTransferProofsTable)
    .leftJoin(subscriptionPlansTable, eq(bankTransferProofsTable.planId, subscriptionPlansTable.id))
    .where(eq(bankTransferProofsTable.tenantId, tenant.tenantId))
    .orderBy(bankTransferProofsTable.createdAt);

  res.json(proofs);
});

export default router;
