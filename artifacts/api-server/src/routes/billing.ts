import { Router, type IRouter } from "express";
import {
  db, subscriptionsTable, subscriptionPlansTable, tenantsTable,
  bankAccountSettingsTable, bankTransferProofsTable, subscriptionInvoicesTable,
  subscriptionCouponsTable, subscriptionCouponRedemptionsTable,
  type SubscriptionInvoice,
} from "@workspace/db";
import { recordResellerCommission } from "./reseller";
import { creditWallet as creditTopupWallet } from "./topup";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { getSetting } from "./settings";
import { getActiveProductCount, planProductLimitError } from "../utils/plan-limits";
import { issueSubscriptionInvoice, renderInvoiceDocs, sendInvoiceEmail } from "../lib/subscription-invoices";

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

/* ─── Top-Up wallet funding helpers ───
   The top-up wallet is denominated in JMD, but the payment gateways charge in
   USD (matching the proven subscription config). The tenant enters the JMD
   credit they want; we convert to a USD charge via a superadmin-configurable
   rate and credit the wallet in JMD on success. */
const TOPUP_MIN_JMD = 100;
const TOPUP_MAX_JMD = 5_000_000;

async function getTopupJmdPerUsd(): Promise<number> {
  const raw = await getSetting("topup_jmd_per_usd", 0);
  const n = Number(raw);
  return n > 0 ? n : 158;
}

function jmdToUsd(jmd: number, rate: number): number {
  return Math.round((jmd / rate) * 100) / 100;
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

  const limitErr = planProductLimitError(plan, await getActiveProductCount(tenant.tenantId));
  if (limitErr) { res.status(409).json(limitErr); return; }

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

  // Re-check the product limit before capturing the payment (defense in depth:
  // the client could capture with a different planSlug than create-order used).
  const [capturePlan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
  if (capturePlan) {
    const captureLimitErr = planProductLimitError(capturePlan, await getActiveProductCount(tenant.tenantId));
    if (captureLimitErr) { res.status(409).json(captureLimitErr); return; }
  }

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
        await issueSubscriptionInvoice({
          tenantId: tenant.tenantId, planId: plan.id, planName: plan.name,
          billingCycle: parsed.data.billingCycle, amount, currency: "USD",
          provider: "paypal", paymentMethodLabel: "PayPal", providerRef: captured.id,
          periodStart: now, periodEnd, paidAt: now,
        });
      }
    }

    res.json({ status: captured.status, orderId: captured.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to capture PayPal payment", details: String(err) });
  }
});

/* ─── PowerTranz: Pending 3DS Store (in-memory, 10-min TTL) ─── */
interface Pending3DS {
  kind: "subscription" | "wallet";
  tenantId: number; planId: number; billingCycle: string; amount: number; planName: string;
  status: "pending" | "approved" | "declined";
  txId?: string; rrn?: string; message?: string;
  fundJmd?: number;
}
const pending3DS = new Map<string, Pending3DS>();

async function activateSubscription(
  tenantId: number, planId: number, billingCycle: string, txId?: string,
  invoice?: { amount: number; planName: string },
) {
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

  if (invoice) {
    await issueSubscriptionInvoice({
      tenantId, planId, planName: invoice.planName, billingCycle, amount: invoice.amount,
      currency: "USD", provider: "powertranz", paymentMethodLabel: "Card",
      providerRef: txId ?? null, periodStart: now, periodEnd, paidAt: now,
    });
  }
}

async function callPowerTranz(endpoint: string, body: object | string): Promise<{ raw: string; status: number; data: Record<string, unknown> }> {
  const { spId, spPassword, base } = await getPowerTranzConfig();
  const bodyStr = JSON.stringify(body);
  const resp = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json",
      "PowerTranz-PowerTranzId": spId,
      "PowerTranz-PowerTranzPassword": spPassword,
    },
    body: bodyStr,
  });
  const raw = await resp.text();
  if (typeof body === "object") {
    const safeSent = JSON.parse(JSON.stringify(body));
    if (safeSent?.Source?.CardPan) safeSent.Source.CardPan = `****${String(safeSent.Source.CardPan).slice(-4)}`;
    if (safeSent?.Source?.CardCvv) safeSent.Source.CardCvv = "***";
    if (safeSent?.Source?.CardSecurityCode) safeSent.Source.CardSecurityCode = "***";
    console.log(`[PowerTranz] ${endpoint} sent:`, JSON.stringify(safeSent).slice(0, 600));
  } else {
    console.log(`[PowerTranz] ${endpoint} sent: (raw string token)`);
  }
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

  const limitErr = planProductLimitError(plan, await getActiveProductCount(tenant.tenantId));
  if (limitErr) { res.status(409).json(limitErr); return; }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  // Expiry: user enters MM / YY → convert to YYMM (e.g. "12 / 31" → "3112")
  const [mm, yy] = parsed.data.cardExpiry.split("/").map((s) => s.trim());
  const cardExpiration = `${yy}${mm}`;
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
        CardCvv: parsed.data.cardCvv,
        CardExpiration: cardExpiration,
        CardholderName: parsed.data.cardholderName,
      },
      OrderIdentifier: `NXPOS-${tenant.tenantId}-${Date.now()}`,
      ExtendedData: {
        ThreeDSecure: {
          ChallengeWindowSize: "05",
          ChallengeIndicator: "01",
        },
        MerchantResponseUrl: merchantResponseUrl,
      },
    });

    const isoCode = data.IsoResponseCode as string | undefined;
    const spiToken = data.SpiToken as string | undefined;

    // SP4 = 3DS flow initiated — return SpiToken + RedirectData to frontend
    if (isoCode === "SP4" && spiToken && data.RedirectData) {
      pending3DS.set(spiToken, {
        kind: "subscription",
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
      await activateSubscription(tenant.tenantId, plan.id, parsed.data.billingCycle, data.TransactionIdentifier as string, { amount: Number(amount), planName: plan.name });
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

  // Final product-limit recheck BEFORE capturing the payment — the tenant may
  // have added products during the 3DS challenge. Abandoning here (not calling
  // /api/spi/payment) means the card is never charged. (Subscription only —
  // wallet funding is not gated by the product limit.)
  if (pending.kind === "subscription") {
    const [pendingPlan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, pending.planId));
    if (pendingPlan) {
      const limitErr = planProductLimitError(pendingPlan, await getActiveProductCount(pending.tenantId));
      if (limitErr) {
        pending3DS.set(spiToken, { ...pending, status: "declined", message: limitErr.error });
        res.send(closeScript("declined", limitErr.error));
        return;
      }
    }
  }

  try {
    // Payment step: body must be the raw SpiToken string, not a JSON object
    const { data } = await callPowerTranz("/api/spi/payment", spiToken);

    if (data.Approved) {
      const rrn = data.RrN ? ` · RRN: ${data.RrN}` : "";
      if (pending.kind === "wallet") {
        await creditTopupWallet(pending.tenantId, pending.fundJmd ?? 0, "Wallet funding (card)", data.TransactionIdentifier as string);
        pending3DS.set(spiToken, { ...pending, status: "approved", txId: data.TransactionIdentifier as string, rrn: data.RrN as string });
        setTimeout(() => pending3DS.delete(spiToken), 5 * 60 * 1000);
        res.send(closeScript("approved", `Wallet funded!${rrn}`, `,fundJmd:${JSON.stringify(pending.fundJmd ?? 0)}`));
      } else {
        await activateSubscription(pending.tenantId, pending.planId, pending.billingCycle, data.TransactionIdentifier as string, { amount: pending.amount, planName: pending.planName });
        await recordResellerCommission(pending.tenantId, pending.planId, pending.amount);
        pending3DS.set(spiToken, { ...pending, status: "approved", txId: data.TransactionIdentifier as string, rrn: data.RrN as string });
        setTimeout(() => pending3DS.delete(spiToken), 5 * 60 * 1000);
        res.send(closeScript("approved", `Payment approved!${rrn}`, `,planName:${JSON.stringify(pending.planName)}`));
      }
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
  res.json({ status: p.status, planName: p.planName, rrn: p.rrn, message: p.message, fundJmd: p.fundJmd });
});

/* ─── Top-Up Wallet Funding ─── */

// FX rate so the frontend can show the tenant the USD they will be charged.
router.get("/billing/topup-wallet/fx", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }
  const jmdPerUsd = await getTopupJmdPerUsd();
  res.json({ jmdPerUsd, minJmd: TOPUP_MIN_JMD, maxJmd: TOPUP_MAX_JMD });
});

// Pending PayPal wallet-funding orders (in-memory, 30-min TTL). Binds each
// order to the tenant that created it + the JMD credit that was quoted, so the
// capture step credits the correct wallet by the quoted amount (immune to the
// client swapping order IDs or the FX rate drifting between create and capture).
interface PendingPayPalFund { tenantId: number; jmdAmount: number; }
const pendingPayPalFunds = new Map<string, PendingPayPalFund>();

const FundJmdBody = z.object({ jmdAmount: z.number().positive() });

function validateFundJmd(jmdAmount: number): string | null {
  if (!Number.isFinite(jmdAmount)) return "Invalid amount.";
  if (jmdAmount < TOPUP_MIN_JMD) return `Minimum funding amount is J$${TOPUP_MIN_JMD}.`;
  if (jmdAmount > TOPUP_MAX_JMD) return `Maximum funding amount is J$${TOPUP_MAX_JMD.toLocaleString()}.`;
  return null;
}

// PayPal: create order (charged in USD, converted from the requested JMD).
router.post("/billing/topup-wallet/paypal/create-order", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = FundJmdBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const jmdAmount = Math.round(parsed.data.jmdAmount);
  const err = validateFundJmd(jmdAmount);
  if (err) { res.status(400).json({ error: err }); return; }

  const rate = await getTopupJmdPerUsd();
  const usd = jmdToUsd(jmdAmount, rate);
  if (usd <= 0) { res.status(400).json({ error: "Amount too small to charge." }); return; }

  try {
    const token = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          description: `NEXXUS Top-Up wallet funding — J$${jmdAmount.toLocaleString()}`,
          amount: { currency_code: "USD", value: usd.toFixed(2) },
          custom_id: `topup:${tenant.tenantId}:${jmdAmount}`,
        }],
        application_context: { brand_name: "NEXXUS POS", user_action: "PAY_NOW" },
      }),
    });
    if (!resp.ok) { const e = await resp.text(); throw new Error(`PayPal error: ${e}`); }
    const order = await resp.json() as { id: string };
    pendingPayPalFunds.set(order.id, { tenantId: tenant.tenantId, jmdAmount });
    setTimeout(() => pendingPayPalFunds.delete(order.id), 30 * 60 * 1000);
    res.json({ orderId: order.id, jmdAmount, usd });
  } catch (e) {
    res.status(500).json({ error: "Failed to create PayPal order", details: String(e) });
  }
});

// PayPal: capture order. Wallet is credited from the ACTUAL captured USD × rate
// (server-authoritative — the client-supplied amount is never trusted).
const CaptureFundBody = z.object({ orderId: z.string() });

router.post("/billing/topup-wallet/paypal/capture-order", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CaptureFundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  // The order must have been created by THIS tenant via create-order (never trust
  // a raw orderId). This binds the capture to the quoted tenant + JMD amount.
  const intent = pendingPayPalFunds.get(parsed.data.orderId);
  if (!intent || intent.tenantId !== tenant.tenantId) {
    res.status(400).json({ error: "Unknown or expired funding order. Please start again." });
    return;
  }

  try {
    const ppToken = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${parsed.data.orderId}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ppToken}` },
    });
    if (!resp.ok) { const e = await resp.text(); throw new Error(`PayPal capture error: ${e}`); }
    const captured = await resp.json() as { id: string; status: string };

    if (captured.status === "COMPLETED") {
      pendingPayPalFunds.delete(parsed.data.orderId);
      const balance = await creditTopupWallet(intent.tenantId, intent.jmdAmount, "Wallet funding (PayPal)", captured.id);
      res.json({ status: captured.status, orderId: captured.id, jmdCredited: intent.jmdAmount, balance });
      return;
    }
    res.json({ status: captured.status, orderId: captured.id });
  } catch (e) {
    res.status(500).json({ error: "Failed to capture PayPal payment", details: String(e) });
  }
});

// PowerTranz (FAC) 3DS: initiate a wallet-funding charge (USD, converted from JMD).
const PowerTranzFundBody = z.object({
  jmdAmount: z.number().positive(),
  cardNumber: z.string(),
  cardExpiry: z.string(),
  cardCvv: z.string(),
  cardholderName: z.string(),
  returnUrl: z.string().url(),
});

router.post("/billing/topup-wallet/powertranz/initiate", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PowerTranzFundBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.issues }); return; }

  const jmdAmount = Math.round(parsed.data.jmdAmount);
  const vErr = validateFundJmd(jmdAmount);
  if (vErr) { res.status(400).json({ error: vErr }); return; }

  const { spId, spPassword, enabled } = await getPowerTranzConfig();
  if (!spId || !spPassword) { res.status(503).json({ error: "PowerTranz not configured. Add credentials in Superadmin → Gateway Settings." }); return; }
  if (!enabled) { res.status(503).json({ error: "PowerTranz card payments are currently disabled." }); return; }

  const rate = await getTopupJmdPerUsd();
  const usd = jmdToUsd(jmdAmount, rate);
  if (usd <= 0) { res.status(400).json({ error: "Amount too small to charge." }); return; }

  const [mm, yy] = parsed.data.cardExpiry.split("/").map((s) => s.trim());
  const cardExpiration = `${yy}${mm}`;
  const origin = new URL(parsed.data.returnUrl).origin;
  const merchantResponseUrl = `${origin}/api/billing/powertranz/3ds-callback`;

  try {
    const txId = crypto.randomUUID();
    const { data } = await callPowerTranz("/api/spi/sale", {
      TransactionIdentifier: txId,
      TotalAmount: Number(usd.toFixed(2)),
      CurrencyCode: "840",
      ThreeDSecure: true,
      Source: {
        CardPan: parsed.data.cardNumber.replace(/\s/g, ""),
        CardCvv: parsed.data.cardCvv,
        CardExpiration: cardExpiration,
        CardholderName: parsed.data.cardholderName,
      },
      OrderIdentifier: `NXTOPUP-${tenant.tenantId}-${Date.now()}`,
      ExtendedData: {
        ThreeDSecure: { ChallengeWindowSize: "05", ChallengeIndicator: "01" },
        MerchantResponseUrl: merchantResponseUrl,
      },
    });

    const isoCode = data.IsoResponseCode as string | undefined;
    const spiToken = data.SpiToken as string | undefined;

    if (isoCode === "SP4" && spiToken && data.RedirectData) {
      pending3DS.set(spiToken, {
        kind: "wallet",
        tenantId: tenant.tenantId, planId: 0, billingCycle: "",
        amount: usd, planName: "Wallet funding", status: "pending",
        fundJmd: jmdAmount,
      });
      setTimeout(() => pending3DS.delete(spiToken!), 10 * 60 * 1000);
      res.json({ step: "3ds", spiToken, redirectData: data.RedirectData });
      return;
    }

    if (data.Approved) {
      const balance = await creditTopupWallet(tenant.tenantId, jmdAmount, "Wallet funding (card)", data.TransactionIdentifier as string);
      res.json({ step: "approved", approved: true, transactionId: data.TransactionIdentifier, rrn: data.RrN, jmdCredited: jmdAmount, balance });
      return;
    }

    const errors = data.Errors as Array<{ Code: string; Message: string }> | undefined;
    res.json({
      step: "declined", approved: false,
      responseCode: isoCode ?? data.ResponseCode ?? "unknown",
      responseMessage: (data.ResponseMessage as string) ?? errors?.[0]?.Message ?? "Payment declined",
    });
  } catch (err) {
    console.error("[PowerTranz] topup initiate error:", err);
    res.status(500).json({ error: "PowerTranz request failed", details: String(err) });
  }
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

/* ─── Free Plan Activation (price = 0, no payment required) ─── */
const FreeActivateBody = z.object({
  planSlug: z.string(),
  billingCycle: z.enum(["monthly", "annual"]),
});

router.post("/billing/free-activate", async (req, res): Promise<void> => {
  // Restricted-role sessions (e.g. technician impersonation) may not mutate subscriptions.
  if (!requireFullTenant(req, res)) return;
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = FreeActivateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

  const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }

  // Promotional plans (e.g. "1 Year Free") can NEVER be self-activated for free.
  // They are gated behind a superadmin-issued coupon code (POST /billing/redeem-coupon).
  // This closes the abuse vector where a free/trial tenant could repeatedly
  // re-activate a hidden promotional plan from the plan picker.
  if (plan.isPromotional) {
    res.status(403).json({ error: "This plan requires a coupon code. Enter your code under \"Redeem a code\"." });
    return;
  }

  const price = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  if (price > 0) {
    res.status(400).json({ error: "This plan requires payment. Please use a payment method." });
    return;
  }

  const limitErr = planProductLimitError(plan, await getActiveProductCount(tenant.tenantId));
  if (limitErr) { res.status(409).json(limitErr); return; }

  const now = new Date();
  const periodEnd = new Date(now);
  if (parsed.data.billingCycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenant.tenantId));

  // Block self-service downgrade to a free plan for tenants that have ever held
  // a paid subscription (any provider other than "free"), regardless of current
  // status. A superadmin must perform the downgrade via
  // /superadmin/tenants/:id so that billing records and plan limits are handled
  // deliberately. Checking only status==="active" was the prior bug: a tenant
  // whose status was changed to "past_due", "trial", or "cancelled" by a
  // superadmin could still self-downgrade even though their provider was paid.
  if (existing && existing.provider && existing.provider !== "free") {
    res.status(403).json({
      error: "Your account is on a paid plan. To downgrade to a free plan, please contact support.",
    });
    return;
  }

  if (existing) {
    await db.update(subscriptionsTable).set({
      planId: plan.id, status: "active", provider: "free", providerOrderId: null,
      billingCycle: parsed.data.billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd, updatedAt: now,
    }).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
  } else {
    await db.insert(subscriptionsTable).values({
      tenantId: tenant.tenantId, planId: plan.id, status: "active", provider: "free",
      billingCycle: parsed.data.billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd,
    });
  }
  await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, tenant.tenantId));

  res.json({ success: true, plan: { name: plan.name, slug: plan.slug } });
});

/* ─── Redeem a Coupon Code (unlocks a promotional plan) ─── */
class CouponExhaustedError extends Error {}
const RedeemCouponBody = z.object({ code: z.string().min(1).max(64) });

router.post("/billing/redeem-coupon", async (req, res): Promise<void> => {
  // Restricted-role sessions (e.g. technician impersonation) may not mutate subscriptions.
  if (!requireFullTenant(req, res)) return;
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = RedeemCouponBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please enter a coupon code." }); return; }
  const code = parsed.data.code.trim().toUpperCase();

  try {
    const result = await db.transaction(async (tx) => {
      const [coupon] = await tx.select().from(subscriptionCouponsTable)
        .where(eq(subscriptionCouponsTable.code, code));
      if (!coupon || !coupon.isActive) {
        return { status: 404 as const, body: { error: "That code is not valid." } };
      }
      if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
        return { status: 400 as const, body: { error: "That code has expired." } };
      }

      const [plan] = await tx.select().from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, coupon.planId));
      if (!plan || !plan.isActive) {
        return { status: 400 as const, body: { error: "The plan for this code is no longer available." } };
      }

      // Enforce the plan's product ceiling before granting the plan.
      const limitErr = planProductLimitError(plan, await getActiveProductCount(tenant.tenantId));
      if (limitErr) return { status: 409 as const, body: limitErr };

      // One redemption per (coupon, tenant). The unique index makes this race-safe;
      // catch the violation and report a friendly message.
      try {
        await tx.insert(subscriptionCouponRedemptionsTable).values({
          couponId: coupon.id, tenantId: tenant.tenantId, planId: plan.id,
        });
      } catch (e) {
        if (e instanceof Error && /unique|duplicate/i.test(e.message)) {
          return { status: 409 as const, body: { error: "You have already redeemed this code." } };
        }
        throw e;
      }

      // Atomically claim one redemption slot. The conditional WHERE guards against
      // over-redeeming a batch code under concurrency.
      const claimed = await tx.update(subscriptionCouponsTable)
        .set({ redemptionCount: sql`${subscriptionCouponsTable.redemptionCount} + 1`, updatedAt: new Date() })
        .where(and(
          eq(subscriptionCouponsTable.id, coupon.id),
          eq(subscriptionCouponsTable.isActive, true),
          lt(subscriptionCouponsTable.redemptionCount, subscriptionCouponsTable.maxRedemptions),
        ))
        .returning({ id: subscriptionCouponsTable.id });
      if (claimed.length === 0) {
        // Roll back the redemption insert above.
        throw new CouponExhaustedError();
      }

      const billingCycle = coupon.billingCycle === "monthly" ? "monthly" : "annual";
      const now = new Date();
      const periodEnd = new Date(now);
      if (plan.durationDays && plan.durationDays > 0) {
        periodEnd.setDate(periodEnd.getDate() + plan.durationDays);
      } else if (billingCycle === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const [existing] = await tx.select().from(subscriptionsTable)
        .where(eq(subscriptionsTable.tenantId, tenant.tenantId));
      if (existing) {
        await tx.update(subscriptionsTable).set({
          planId: plan.id, status: "active", provider: "free", providerOrderId: null,
          billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd, updatedAt: now,
        }).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
      } else {
        await tx.insert(subscriptionsTable).values({
          tenantId: tenant.tenantId, planId: plan.id, status: "active", provider: "free",
          billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd,
        });
      }
      await tx.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 })
        .where(eq(tenantsTable.id, tenant.tenantId));

      return { status: 200 as const, body: { success: true, plan: { name: plan.name, slug: plan.slug } } };
    });
    res.status(result.status).json(result.body);
  } catch (e) {
    if (e instanceof CouponExhaustedError) {
      res.status(409).json({ error: "This code has already been fully redeemed." });
      return;
    }
    req.log.error({ err: e }, "coupon redemption failed");
    res.status(500).json({ error: "Could not redeem code. Please try again." });
  }
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

  const limitErr = planProductLimitError(plan, await getActiveProductCount(tenant.tenantId));
  if (limitErr) { res.status(409).json(limitErr); return; }

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

/* ─── Billing history: list invoices ─── */
router.get("/billing/invoices", async (req, res): Promise<void> => {
  const tenant = getTenantFromAuth(req);
  if (!tenant) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: subscriptionInvoicesTable.id,
    invoiceNumber: subscriptionInvoicesTable.invoiceNumber,
    receiptNumber: subscriptionInvoicesTable.receiptNumber,
    planName: subscriptionInvoicesTable.planName,
    billingCycle: subscriptionInvoicesTable.billingCycle,
    amount: subscriptionInvoicesTable.amount,
    currency: subscriptionInvoicesTable.currency,
    provider: subscriptionInvoicesTable.provider,
    paymentMethodLabel: subscriptionInvoicesTable.paymentMethodLabel,
    periodStart: subscriptionInvoicesTable.periodStart,
    periodEnd: subscriptionInvoicesTable.periodEnd,
    paidAt: subscriptionInvoicesTable.paidAt,
    issuedAt: subscriptionInvoicesTable.issuedAt,
    emailedAt: subscriptionInvoicesTable.emailedAt,
    emailStatus: subscriptionInvoicesTable.emailStatus,
  }).from(subscriptionInvoicesTable)
    .where(eq(subscriptionInvoicesTable.tenantId, tenant.tenantId))
    .orderBy(desc(subscriptionInvoicesTable.paidAt));

  res.json(rows);
});

async function loadTenantInvoice(
  req: { headers: { authorization?: string } }, id: number,
): Promise<{ ok: true; rec: SubscriptionInvoice } | { ok: false; status: number }> {
  const tenant = getTenantFromAuth(req);
  if (!tenant) return { ok: false, status: 401 };
  const [rec] = await db.select().from(subscriptionInvoicesTable).where(and(
    eq(subscriptionInvoicesTable.id, id),
    eq(subscriptionInvoicesTable.tenantId, tenant.tenantId),
  ));
  if (!rec) return { ok: false, status: 404 };
  return { ok: true, rec };
}

/* ─── Billing history: download invoice PDF ─── */
router.get("/billing/invoices/:id/invoice.pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const found = await loadTenantInvoice(req, id);
  if (!found.ok) { res.status(found.status).json({ error: found.status === 401 ? "Unauthorized" : "Not found" }); return; }
  const { invoice } = await renderInvoiceDocs(found.rec);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Invoice-${found.rec.invoiceNumber}.pdf"`);
  res.send(invoice);
});

/* ─── Billing history: download receipt PDF ─── */
router.get("/billing/invoices/:id/receipt.pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const found = await loadTenantInvoice(req, id);
  if (!found.ok) { res.status(found.status).json({ error: found.status === 401 ? "Unauthorized" : "Not found" }); return; }
  const { receipt } = await renderInvoiceDocs(found.rec);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="Receipt-${found.rec.receiptNumber}.pdf"`);
  res.send(receipt);
});

/* ─── Billing history: re-send invoice email ─── */
router.post("/billing/invoices/:id/resend", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const found = await loadTenantInvoice(req, id);
  if (!found.ok) { res.status(found.status).json({ error: found.status === 401 ? "Unauthorized" : "Not found" }); return; }
  try {
    await sendInvoiceEmail(found.rec);
    res.json({ ok: true, email: found.rec.billToEmail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(subscriptionInvoicesTable)
      .set({ emailStatus: "failed", emailError: msg })
      .where(eq(subscriptionInvoicesTable.id, found.rec.id));
    res.status(502).json({ error: "Failed to send email", details: msg });
  }
});

export default router;
