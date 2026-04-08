import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const DEFAULTS: Record<string, string> = {
  email_provider: "resend",
  from_email: "onboarding@resend.dev",
  from_name: "NEXXUS POS",
  business_name: "NEXXUS POS",
  business_address: "",
  business_phone: "",
  tax_rate: "15",
  receipt_footer: "Thank you for your business!",
  base_currency: "JMD",
  secondary_currency: "",
  currency_rate: "0",
  daily_digest_enabled: "false",
  daily_digest_email: "",
  daily_digest_hour: "7",
  low_stock_threshold: "5",
};

async function getSetting(key: string, tenantId = 0): Promise<string> {
  const [row] = await db.select().from(appSettingsTable)
    .where(and(eq(appSettingsTable.tenantId, tenantId), eq(appSettingsTable.key, key)));
  return row?.value ?? DEFAULTS[key] ?? "";
}

async function getAllSettings(tenantId = 0): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettingsTable)
    .where(eq(appSettingsTable.tenantId, tenantId));
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

router.get("/settings", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const settings = await getAllSettings(tenantId);
  res.json(settings);
});

const UpdateBody = z.record(z.string(), z.string());

router.patch("/settings", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insert(appSettingsTable)
      .values({ tenantId, key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: [appSettingsTable.tenantId, appSettingsTable.key], set: { value, updatedAt: new Date() } });
  }
  const updated = await getAllSettings(tenantId);
  res.json(updated);
});

export { getSetting, getAllSettings };
export default router;
