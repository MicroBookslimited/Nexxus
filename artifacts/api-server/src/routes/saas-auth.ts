import { Router, type IRouter } from "express";
import { db, tenantsTable, subscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

const router: IRouter = Router();

function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function signToken(tenantId: number, email: string) {
  return jwt.sign({ tenantId, email, type: "tenant" }, getJwtSecret(), { expiresIn: "7d" });
}

export function verifyTenantToken(token: string): { tenantId: number; email: string } | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { tenantId: number; email: string; type: string };
    if (payload.type !== "tenant") return null;
    return { tenantId: payload.tenantId, email: payload.email };
  } catch {
    return null;
  }
}

const RegisterBody = z.object({
  businessName: z.string().min(2),
  ownerName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().optional(),
  country: z.string().optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/saas/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const { businessName, ownerName, email, password, phone, country } = parsed.data;

  const [existing] = await db.select().from(tenantsTable).where(eq(tenantsTable.email, email));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcryptjs.hash(password, 12);

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      businessName,
      ownerName,
      email,
      passwordHash,
      phone,
      country: country ?? "US",
      status: "active",
      onboardingStep: 2,
      onboardingComplete: false,
    })
    .returning();

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  await db.insert(subscriptionsTable).values({
    tenantId: tenant.id,
    status: "trial",
    trialEndsAt: trialEnd,
  });

  const token = signToken(tenant.id, tenant.email);
  res.json({ token, tenant: { id: tenant.id, businessName: tenant.businessName, email: tenant.email, onboardingStep: tenant.onboardingStep } });
});

router.post("/saas/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.email, parsed.data.email));
  if (!tenant) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcryptjs.compare(parsed.data.password, tenant.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const [subscription] = await db
    .select({ status: subscriptionsTable.status, planId: subscriptionsTable.planId, trialEndsAt: subscriptionsTable.trialEndsAt })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id));

  const token = signToken(tenant.id, tenant.email);
  res.json({
    token,
    tenant: {
      id: tenant.id,
      businessName: tenant.businessName,
      email: tenant.email,
      onboardingStep: tenant.onboardingStep,
      onboardingComplete: tenant.onboardingComplete,
    },
    subscription,
  });
});

router.get("/saas/me", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenant.id));

  let plan = null;
  if (subscription?.planId) {
    const [p] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, subscription.planId));
    plan = p;
  }

  res.json({ tenant: { id: tenant.id, businessName: tenant.businessName, email: tenant.email, ownerName: tenant.ownerName, phone: tenant.phone, country: tenant.country, onboardingStep: tenant.onboardingStep, onboardingComplete: tenant.onboardingComplete, status: tenant.status }, subscription, plan });
});

router.patch("/saas/onboarding", async (req, res): Promise<void> => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyTenantToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const { step, ...fields } = req.body as { step: number; [key: string]: unknown };

  await db
    .update(tenantsTable)
    .set({ ...fields, onboardingStep: step, updatedAt: new Date() })
    .where(eq(tenantsTable.id, payload.tenantId));

  if (step >= 5) {
    await db.update(tenantsTable).set({ onboardingComplete: true }).where(eq(tenantsTable.id, payload.tenantId));
  }

  const [updated] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId));
  res.json({ tenant: updated });
});

export default router;
