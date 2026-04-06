import { Router, type IRouter } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DEFAULTS: Record<string, string> = {
  email_provider: "resend",
  business_name: "Nexus POS",
  business_address: "",
  business_phone: "",
  tax_rate: "0.08",
  receipt_footer: "Thank you for your business!",
  base_currency: "JMD",
  secondary_currency: "",
  currency_rate: "0",
};

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? DEFAULTS[key] ?? "";
}

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(appSettingsTable);
  const map: Record<string, string> = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getAllSettings();
  res.json(settings);
});

const UpdateBody = z.record(z.string(), z.string());

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  const updated = await getAllSettings();
  res.json(updated);
});

export { getSetting, getAllSettings };
export default router;
