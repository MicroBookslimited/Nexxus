import { Router, type IRouter } from "express";
import { db, subscriptionsTable, subscriptionPlansTable, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

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
const POWERTRANZ_BASE =
  process.env["POWERTRANZ_ENV"] === "production"
    ? "https://gateway.powertranz.com"
    : "https://staging.powertranz.com";

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
  if (!tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreatePayPalOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;

  try {
    const token = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            description: `Nexus POS — ${plan.name} (${parsed.data.billingCycle})`,
            amount: {
              currency_code: "USD",
              value: amount.toFixed(2),
            },
            custom_id: `${tenant.tenantId}:${plan.id}:${parsed.data.billingCycle}`,
          },
        ],
        application_context: {
          brand_name: "Nexus POS",
          user_action: "PAY_NOW",
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`PayPal error: ${err}`);
    }

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
  if (!tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CapturePayPalOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const ppToken = await getPayPalToken();
    const resp = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${parsed.data.orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ppToken}`,
      },
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`PayPal capture error: ${err}`);
    }

    const captured = await resp.json() as { id: string; status: string };

    if (captured.status === "COMPLETED") {
      const [plan] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));

      if (plan) {
        const now = new Date();
        const periodEnd = new Date(now);
        if (parsed.data.billingCycle === "annual") {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        const [existing] = await db
          .select()
          .from(subscriptionsTable)
          .where(eq(subscriptionsTable.tenantId, tenant.tenantId));

        if (existing) {
          await db
            .update(subscriptionsTable)
            .set({
              planId: plan.id,
              status: "active",
              provider: "paypal",
              providerOrderId: captured.id,
              billingCycle: parsed.data.billingCycle,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              updatedAt: now,
            })
            .where(eq(subscriptionsTable.tenantId, tenant.tenantId));
        } else {
          await db.insert(subscriptionsTable).values({
            tenantId: tenant.tenantId,
            planId: plan.id,
            status: "active",
            provider: "paypal",
            providerOrderId: captured.id,
            billingCycle: parsed.data.billingCycle,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          });
        }

        await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, tenant.tenantId));
      }
    }

    res.json({ status: captured.status, orderId: captured.id });
  } catch (err) {
    res.status(500).json({ error: "Failed to capture PayPal payment", details: String(err) });
  }
});

/* ─── PowerTranz: Initiate Payment ─── */
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
  if (!tenant) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = PowerTranzBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const spId = process.env["POWERTRANZ_SPID"];
  const spPassword = process.env["POWERTRANZ_SPPASSWORD"];
  if (!spId || !spPassword) {
    res.status(503).json({ error: "PowerTranz not configured. Please set POWERTRANZ_SPID and POWERTRANZ_SPPASSWORD." });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.slug, parsed.data.planSlug));

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const amount = parsed.data.billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
  const [mm, yy] = parsed.data.cardExpiry.split("/").map((s) => s.trim());
  const expiryDate = `20${yy}${mm}`;

  try {
    const payload = {
      TransactionIdentifier: `NXPOS-${tenant.tenantId}-${Date.now()}`,
      TotalAmount: amount,
      CurrencyCode: "840",
      ThreeDSecure: false,
      Source: {
        CardPan: parsed.data.cardNumber.replace(/\s/g, ""),
        CardCvv: parsed.data.cardCvv,
        CardExpiration: expiryDate,
        CardholderName: parsed.data.cardholderName,
      },
      OrderIdentifier: `NXPOS-${tenant.tenantId}`,
      AddressMatch: false,
      ExtendedData: {
        ThreeDSecure: { AuthenticationIndicator: "0" },
      },
    };

    const resp = await fetch(`${POWERTRANZ_BASE}/api/paymentrequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        PowerTranz_Id: spId,
        PowerTranz_Password: spPassword,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json() as {
      Approved?: boolean;
      TransactionIdentifier?: string;
      ResponseCode?: string;
      IsoResponseCode?: string;
      RrN?: string;
      RedirectData?: string;
    };

    if (data.Approved) {
      const now = new Date();
      const periodEnd = new Date(now);
      if (parsed.data.billingCycle === "annual") {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
      if (existing) {
        await db.update(subscriptionsTable).set({
          planId: plan.id,
          status: "active",
          provider: "powertranz",
          providerOrderId: data.TransactionIdentifier,
          billingCycle: parsed.data.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        }).where(eq(subscriptionsTable.tenantId, tenant.tenantId));
      } else {
        await db.insert(subscriptionsTable).values({
          tenantId: tenant.tenantId,
          planId: plan.id,
          status: "active",
          provider: "powertranz",
          providerOrderId: data.TransactionIdentifier,
          billingCycle: parsed.data.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        });
      }
      await db.update(tenantsTable).set({ onboardingComplete: true, onboardingStep: 5 }).where(eq(tenantsTable.id, tenant.tenantId));
    }

    res.json({
      approved: data.Approved ?? false,
      transactionId: data.TransactionIdentifier,
      responseCode: data.IsoResponseCode ?? data.ResponseCode,
      redirectData: data.RedirectData,
    });
  } catch (err) {
    res.status(500).json({ error: "PowerTranz request failed", details: String(err) });
  }
});

export default router;
