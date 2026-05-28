import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, staffTable, staffOverrideCardsTable, rolesTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { seedDefaultRoles } from "./roles";

const router: IRouter = Router();

function getTenantId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/**
 * Extract a stable card identifier from raw magstripe data.
 *
 *  - Track 1 starts with `%`, format: `%B<PAN>^<NAME>^<DATA>?`
 *  - Track 2 starts with `;`, format: `;<PAN>=<DATA>?`
 *  - Many HID readers also emit plain digits (RFID/NFC).
 *
 * We keep only the PAN (primary account digits) — never the cardholder
 * name or expiry data — so we don't unnecessarily persist PII.
 */
export function extractCardNumber(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/[\r\n]/g, "");

  // Track 1: %B<digits>^...
  const t1 = /%B?(\d{6,30})\^/.exec(trimmed);
  if (t1?.[1]) return t1[1];

  // Track 2: ;<digits>=...
  const t2 = /;(\d{6,30})=/.exec(trimmed);
  if (t2?.[1]) return t2[1];

  // RFID/NFC keyboard-wedge or plain numeric badge: just digits
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 6 && digits.length <= 30) return digits;

  return null;
}

function sanitizeStaff(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    isActive: s.isActive,
    createdAt: s.createdAt,
  };
}

/* ─── POST /api/staff/authenticate-card ─────────────────────────────
 * Public-ish endpoint mirroring /api/staff/authenticate but keyed on
 * a swipe-card number instead of a PIN.
 *
 * Body: { cardData: string, requiredRoles?: string[] }
 * Response: { id, name, role, isActive, createdAt, permissions }
 */
router.post("/staff/authenticate-card", async (req, res): Promise<void> => {
  const parsed = z.object({
    cardData: z.string().min(1),
    requiredRoles: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "cardData is required" }); return; }

  const cardNumber = extractCardNumber(parsed.data.cardData);
  if (!cardNumber) { res.status(400).json({ error: "Unrecognized card format" }); return; }

  // Require a tenant token. Card lookup must be tenant-scoped — otherwise
  // a swipe could match a card belonging to a different business.
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [row] = await db.select({
    staff: staffTable,
    tenantId: staffOverrideCardsTable.tenantId,
  })
    .from(staffOverrideCardsTable)
    .innerJoin(staffTable, eq(staffTable.id, staffOverrideCardsTable.staffId))
    .where(and(
      eq(staffOverrideCardsTable.tenantId, tenantId),
      eq(staffOverrideCardsTable.cardNumber, cardNumber),
      eq(staffOverrideCardsTable.isActive, true),
      eq(staffTable.isActive, true),
    ))
    .limit(1);

  if (!row) { res.status(401).json({ error: "Card not recognized" }); return; }

  const { staff: match, tenantId: cardTenantId } = row;

  if (parsed.data.requiredRoles && parsed.data.requiredRoles.length > 0) {
    const rolesLower = parsed.data.requiredRoles.map(r => r.toLowerCase());
    if (!rolesLower.includes((match.role ?? "").toLowerCase())) {
      res.status(403).json({ error: "Insufficient role", role: match.role });
      return;
    }
  }

  let permissions: string[] = [];
  await seedDefaultRoles(cardTenantId);
  const roleRows = await db.select({ permissions: rolesTable.permissions })
    .from(rolesTable)
    .where(and(
      eq(rolesTable.tenantId, cardTenantId),
      sql`LOWER(${rolesTable.name}) = LOWER(${match.role})`,
    ));
  if (roleRows[0]) permissions = roleRows[0].permissions as string[];

  res.json({ ...sanitizeStaff(match), permissions });
});

/* ─── GET /api/staff/:id/override-cards ────────────────────────────*/
router.get("/staff/:id/override-cards", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(staffId)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  const cards = await db.select()
    .from(staffOverrideCardsTable)
    .where(and(
      eq(staffOverrideCardsTable.staffId, staffId),
      eq(staffOverrideCardsTable.tenantId, tenantId),
    ))
    .orderBy(staffOverrideCardsTable.createdAt);

  // Mask: only return last 4 digits to UI by default.
  res.json(cards.map(c => ({
    id: c.id,
    staffId: c.staffId,
    last4: c.cardNumber.slice(-4),
    label: c.label,
    isActive: c.isActive,
    createdAt: c.createdAt,
  })));
});

/* ─── POST /api/staff/:id/override-cards ───────────────────────────
 * Body: { cardData: string, label?: string }
 * Captures a swipe (raw track data) and binds it to this staff member.
 */
router.post("/staff/:id/override-cards", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = parseInt(req.params["id"] ?? "", 10);
  if (isNaN(staffId)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  const parsed = z.object({
    cardData: z.string().min(1),
    label: z.string().max(50).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "cardData required" }); return; }

  const cardNumber = extractCardNumber(parsed.data.cardData);
  if (!cardNumber) { res.status(400).json({ error: "Unrecognized card format" }); return; }

  // Verify staff belongs to tenant
  const [staffRow] = await db.select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  if (!staffRow) { res.status(404).json({ error: "Staff not found" }); return; }

  try {
    const [card] = await db.insert(staffOverrideCardsTable).values({
      tenantId,
      staffId,
      cardNumber,
      label: parsed.data.label ?? null,
      isActive: true,
    }).returning();
    res.status(201).json({
      id: card!.id,
      staffId: card!.staffId,
      last4: card!.cardNumber.slice(-4),
      label: card!.label,
      isActive: card!.isActive,
      createdAt: card!.createdAt,
    });
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? "";
    if (/unique/i.test(msg)) {
      res.status(409).json({ error: "This card is already assigned to a staff member" });
      return;
    }
    throw err;
  }
});

/* ─── PATCH /api/staff/:id/override-cards/:cardId ─────────────────*/
router.patch("/staff/:id/override-cards/:cardId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = parseInt(req.params["id"] ?? "", 10);
  const cardId = parseInt(req.params["cardId"] ?? "", 10);
  if (isNaN(cardId) || isNaN(staffId)) { res.status(400).json({ error: "Invalid card id" }); return; }

  const parsed = z.object({
    isActive: z.boolean().optional(),
    label: z.string().max(50).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const update: Partial<typeof staffOverrideCardsTable.$inferInsert> = {};
  if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
  if (parsed.data.label !== undefined) update.label = parsed.data.label;

  const [updated] = await db.update(staffOverrideCardsTable)
    .set(update)
    .where(and(
      eq(staffOverrideCardsTable.id, cardId),
      eq(staffOverrideCardsTable.staffId, staffId),
      eq(staffOverrideCardsTable.tenantId, tenantId),
    ))
    .returning();
  if (!updated) { res.status(404).json({ error: "Card not found" }); return; }
  res.json({
    id: updated.id,
    staffId: updated.staffId,
    last4: updated.cardNumber.slice(-4),
    label: updated.label,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  });
});

/* ─── DELETE /api/staff/:id/override-cards/:cardId ────────────────*/
router.delete("/staff/:id/override-cards/:cardId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = parseInt(req.params["id"] ?? "", 10);
  const cardId = parseInt(req.params["cardId"] ?? "", 10);
  if (isNaN(cardId) || isNaN(staffId)) { res.status(400).json({ error: "Invalid card id" }); return; }

  const result = await db.delete(staffOverrideCardsTable)
    .where(and(
      eq(staffOverrideCardsTable.id, cardId),
      eq(staffOverrideCardsTable.staffId, staffId),
      eq(staffOverrideCardsTable.tenantId, tenantId),
    ))
    .returning({ id: staffOverrideCardsTable.id });
  if (result.length === 0) { res.status(404).json({ error: "Card not found" }); return; }
  res.json({ success: true });
});

export default router;
