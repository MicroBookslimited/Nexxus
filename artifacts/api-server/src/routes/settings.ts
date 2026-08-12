import { Router, type IRouter } from "express";
import { db, appSettingsTable, tenantsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { hasWorkOrdersEntitlement } from "../lib/addon-entitlement";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const DEFAULTS: Record<string, string> = {
  email_provider: "zeptomail",
  from_email: "noreply@microbookspos.com",
  from_name: "NEXXUS POS",
  smtp_host: "",
  smtp_port: "587",
  smtp_secure: "false",
  smtp_user: "",
  smtp_pass: "",
  smtp_from: "",
  smtp_from_name: "",
  business_name: "NEXXUS POS",
  business_address: "",
  business_phone: "",
  business_tax_number: "",
  tax_rate: "15",
  tax_mode: "exclusive",
  default_markup_percentage: "",
  service_charge_enabled: "false",
  service_charge_rate: "",
  receipt_footer: "Thank you for your business!",
  base_currency: "JMD",
  secondary_currency: "",
  currency_rate: "0",
  daily_digest_enabled: "true",
  daily_digest_email: "",
  daily_digest_hour: "1",
  low_stock_threshold: "5",
  low_stock_alerts_enabled: "true",
  low_stock_alerts_email: "",
  low_stock_alerts_hour: "1",
  allow_overselling: "false",
  kiosk_lock_enabled: "false",
  show_product_size: "false",
  product_categories: '["Beverages","Food","Bakery","Merchandise","Other"]',
  topup_enabled: "false",
  topup_commission_rate: "5",
  topup_default_country: "JM",
  timezone: "America/Jamaica",
};

function makeDbKey(tenantId: number, key: string): string {
  return `${tenantId}:${key}`;
}

// Settings that, when not explicitly saved by the tenant, default to the
// information captured during signup (tenants table) instead of static defaults.
const TENANT_FALLBACK_KEYS = ["business_name", "business_phone", "business_address"] as const;

async function tenantBusinessDefaults(tenantId: number): Promise<Record<string, string>> {
  if (!tenantId) return {};
  const [tenant] = await db
    .select({ businessName: tenantsTable.businessName, phone: tenantsTable.phone, address: tenantsTable.address })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return {};
  const out: Record<string, string> = {};
  if (tenant.businessName?.trim()) out["business_name"] = tenant.businessName.trim();
  if (tenant.phone?.trim()) out["business_phone"] = tenant.phone.trim();
  if (tenant.address?.trim()) out["business_address"] = tenant.address.trim();
  return out;
}

async function getSetting(key: string, tenantId = 0): Promise<string> {
  const dbKey = makeDbKey(tenantId, key);
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, dbKey));
  if (row) return row.value;
  if ((TENANT_FALLBACK_KEYS as readonly string[]).includes(key)) {
    const fallback = (await tenantBusinessDefaults(tenantId))[key];
    if (fallback) return fallback;
  }
  return DEFAULTS[key] ?? "";
}

async function getAllSettings(tenantId = 0): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettingsTable)
    .where(eq(appSettingsTable.tenantId, tenantId));
  const map: Record<string, string> = { ...DEFAULTS, ...(await tenantBusinessDefaults(tenantId)) };
  const prefix = `${tenantId}:`;
  for (const row of rows) {
    const originalKey = row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
    map[originalKey] = row.value;
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
  // Paid entitlement keys can't be self-granted through the generic settings
  // endpoint: enabling Work Orders requires a paid-up add-on (or legacy access).
  if (parsed.data["work_orders_enabled"] === "true" && !(await hasWorkOrdersEntitlement(tenantId))) {
    res.status(403).json({ error: "Work Orders is a paid add-on. Purchase it on the Subscription page to enable this module." });
    return;
  }

  for (const [key, value] of Object.entries(parsed.data)) {
    const dbKey = makeDbKey(tenantId, key);
    await db
      .insert(appSettingsTable)
      .values({ key: dbKey, tenantId, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  const updated = await getAllSettings(tenantId);
  res.json(updated);
});

export { getSetting, getAllSettings };
export default router;
