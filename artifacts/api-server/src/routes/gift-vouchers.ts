import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import {
  db,
  giftVouchersTable,
  giftVoucherTransactionsTable,
  customersTable,
  staffTable,
  rolesTable,
} from "@workspace/db";
import {
  ListGiftVouchersQueryParams,
  ListGiftVouchersResponse,
  CreateGiftVoucherBody,
  LookupGiftVoucherResponse,
  GetGiftVoucherResponse,
  CancelGiftVoucherBody,
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import {
  generateVoucherCode,
  normalizeCode,
  isUniqueViolation,
  normalizeVoucher,
  effectiveVoucherStatus,
} from "../lib/vouchers";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const MANUAL_CODE_RE = /^[A-Z0-9-]{4,32}$/;

/* ─── Staff permission gate for voucher management ─────────────────────────
 * An owner tenant session with no staff identity is allowed (mirrors app-wide
 * can() semantics). When a staffId is supplied it must be Owner/Admin or hold
 * the vouchers.manage permission, otherwise a plain cashier is blocked. Returns
 * the resolved staff {id,name} (or nulls for an owner session) on success, or
 * null after writing the appropriate 403/error response.                       */
async function resolveVoucherManager(
  tenantId: number,
  staffId: number | null | undefined,
  res: { status: (n: number) => { json: (b: unknown) => void } },
): Promise<{ id: number | null; name: string | null } | null> {
  if (staffId == null) return { id: null, name: null };
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  if (!staff) {
    res.status(403).json({ error: "Staff not found for this tenant" });
    return null;
  }
  const role = (staff as { role?: string }).role ?? "";
  let allowed = ["Owner", "Admin"].includes(role);
  if (!allowed) {
    const [roleRow] = await db
      .select()
      .from(rolesTable)
      .where(and(eq(rolesTable.tenantId, tenantId), eq(rolesTable.name, role)));
    allowed = !!(
      roleRow &&
      Array.isArray(roleRow.permissions) &&
      roleRow.permissions.includes("vouchers.manage")
    );
  }
  if (!allowed) {
    res.status(403).json({ error: "You do not have permission to manage gift vouchers" });
    return null;
  }
  return { id: staff.id, name: (staff as { name?: string }).name ?? null };
}

/* ─── GET /gift-vouchers — list (open to any tenant session, like quotations) ─── */
router.get("/gift-vouchers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const q = ListGiftVouchersQueryParams.safeParse(req.query);
  const statusFilter = q.success ? q.data.status : undefined;
  const search = q.success ? q.data.search : undefined;

  const conds = [eq(giftVouchersTable.tenantId, tenantId)];
  if (statusFilter) conds.push(eq(giftVouchersTable.status, statusFilter));

  let rows = await db
    .select()
    .from(giftVouchersTable)
    .where(and(...conds))
    .orderBy(desc(giftVouchersTable.createdAt));

  if (search) {
    const s = search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.code.toLowerCase().includes(s) ||
        (r.customerName ?? "").toLowerCase().includes(s) ||
        (r.customerPhone ?? "").toLowerCase().includes(s),
    );
  }

  res.json(ListGiftVouchersResponse.parse(rows.map((r) => normalizeVoucher(r))));
});

/* ─── POST /gift-vouchers — issue a voucher ───────────────────────────────
 * No stock movement and NO tax: a voucher is prepaid store credit, not a sale
 * of goods. Tax applies normally when the voucher is later redeemed. An "issue"
 * ledger row is written in the same transaction so the audit trail is complete.
 * Gated by requireFullTenant (blocks technicians); if a staff identity is
 * supplied it must be Owner/Admin or hold vouchers.manage (a plain cashier is
 * blocked). An owner tenant session with no staff is allowed, mirroring the
 * app-wide can() semantics.                                                   */
router.post("/gift-vouchers", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateGiftVoucherBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const value = r2(parsed.data.originalValue);
  if (!(value > 0) || !Number.isFinite(value)) {
    res.status(400).json({ error: "Voucher value must be greater than zero" });
    return;
  }

  const manager = await resolveVoucherManager(tenantId, parsed.data.staffId, res as never);
  if (!manager) return;
  const issuedByStaffId: number | null = manager.id;
  const issuedByName: string | null = manager.name;

  // Reject a customerId that doesn't belong to this tenant — otherwise the
  // voucher could later embed and leak another tenant's customer PII on read.
  if (parsed.data.customerId != null) {
    const [owned] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.id, parsed.data.customerId), eq(customersTable.tenantId, tenantId)));
    if (!owned) { res.status(400).json({ error: "Customer not found" }); return; }
  }

  // Manual code is optional; issuance is already permission-gated so any
  // authorised issuer may set one.
  const manualCode = parsed.data.code ? normalizeCode(parsed.data.code) : null;
  if (manualCode !== null && !MANUAL_CODE_RE.test(manualCode)) {
    res.status(400).json({ error: "Code must be 4–32 letters, digits or dashes" });
    return;
  }

  const baseValues = {
    tenantId,
    originalValue: value,
    balance: value,
    status: "active",
    customerId: parsed.data.customerId ?? null,
    customerName: parsed.data.customerName ?? null,
    customerPhone: parsed.data.customerPhone ?? null,
    customerEmail: parsed.data.customerEmail ?? null,
    paymentMethod: parsed.data.paymentMethod,
    amountPaid: value,
    notes: parsed.data.notes ?? null,
    expiryDate: parsed.data.expiryDate ?? null,
    issuedByStaffId,
    issuedByName,
  };

  const maxAttempts = manualCode ? 1 : 5;
  let created: typeof giftVouchersTable.$inferSelect | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = manualCode ?? generateVoucherCode();
    try {
      created = await db.transaction(async (tx) => {
        const [v] = await tx
          .insert(giftVouchersTable)
          .values({ ...baseValues, code })
          .returning();
        await tx.insert(giftVoucherTransactionsTable).values({
          tenantId,
          voucherId: v!.id,
          action: "issue",
          amount: value,
          balanceBefore: 0,
          balanceAfter: value,
          staffId: issuedByStaffId,
          staffName: issuedByName,
          notes: "Voucher issued",
        });
        return v!;
      });
      break;
    } catch (e) {
      if (isUniqueViolation(e)) {
        if (manualCode) {
          res.status(409).json({ error: "That voucher code is already in use" });
          return;
        }
        continue; // generated code collided — regenerate and retry
      }
      throw e;
    }
  }

  if (!created) {
    res.status(500).json({ error: "Could not generate a unique voucher code, please try again" });
    return;
  }

  res.status(201).json(GetGiftVoucherResponse.parse(normalizeVoucher(created)));
});

/* ─── POST /gift-vouchers/:id/cancel — void a voucher ─────────────────────
 * Admin/void action: permanently cancels a still-redeemable voucher, zeroing
 * its balance so it drops out of the outstanding-liability total, and writes a
 * "cancel" ledger row capturing the voided amount. Only active / partially
 * redeemed vouchers can be cancelled; already redeemed / cancelled / expired
 * vouchers are rejected. Gated by requireFullTenant + voucher-manage staff. */
router.post("/gift-vouchers/:id/cancel", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CancelGiftVoucherBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const manager = await resolveVoucherManager(tenantId, parsed.data.staffId, res as never);
  if (!manager) return;

  type CancelErr = { httpStatus: number; httpMessage: string };
  const isCancelErr = (e: unknown): e is CancelErr =>
    typeof e === "object" && e !== null && typeof (e as CancelErr).httpStatus === "number";

  let cancelled: typeof giftVouchersTable.$inferSelect | null = null;
  try {
    cancelled = await db.transaction(async (tx) => {
      // Lock the voucher row so a concurrent redemption can't spend the balance
      // we are about to void (and vice-versa).
      const [v] = await tx
        .select()
        .from(giftVouchersTable)
        .where(and(eq(giftVouchersTable.id, id), eq(giftVouchersTable.tenantId, tenantId)))
        .for("update");
      if (!v) throw { httpStatus: 404, httpMessage: "Voucher not found" } satisfies CancelErr;
      if (v.status === "cancelled") throw { httpStatus: 400, httpMessage: "This voucher is already cancelled" } satisfies CancelErr;
      if (v.status === "redeemed") throw { httpStatus: 400, httpMessage: "A fully redeemed voucher cannot be cancelled" } satisfies CancelErr;
      // An expired voucher is already dead (excluded from liability and rejected
      // at redemption); cancelling it would be a meaningless state change.
      if (effectiveVoucherStatus(v) === "expired") throw { httpStatus: 400, httpMessage: "This voucher has expired and cannot be cancelled" } satisfies CancelErr;

      const balanceBefore = r2(v.balance ?? 0);
      const now = new Date();
      const [updated] = await tx
        .update(giftVouchersTable)
        .set({ status: "cancelled", balance: 0, cancelledAt: now, updatedAt: now })
        .where(and(eq(giftVouchersTable.id, id), eq(giftVouchersTable.tenantId, tenantId)))
        .returning();

      await tx.insert(giftVoucherTransactionsTable).values({
        tenantId,
        voucherId: id,
        action: "cancel",
        amount: balanceBefore,
        balanceBefore,
        balanceAfter: 0,
        staffId: manager.id,
        staffName: manager.name,
        notes: parsed.data.reason?.trim() ? `Cancelled: ${parsed.data.reason.trim()}` : "Voucher cancelled",
      });
      return updated!;
    });
  } catch (e) {
    if (isCancelErr(e)) { res.status(e.httpStatus).json({ error: e.httpMessage }); return; }
    throw e;
  }

  res.json(GetGiftVoucherResponse.parse(normalizeVoucher(cancelled)));
});

/* ─── GET /gift-vouchers/reports — liability & per-cashier summary ─────────
 * Registered BEFORE /:id so "reports" is never parsed as a numeric id.
 *  - liability: outstanding balance + count of still-redeemable vouchers, plus
 *    lifetime issued/redeemed totals (face value issued vs. value redeemed).
 *  - byCashier: per-staff issuance and redemption counts/totals, merged across
 *    the voucher table (issuance) and the ledger (redemption).               */
router.get("/gift-vouchers/reports", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vouchers = await db
    .select()
    .from(giftVouchersTable)
    .where(eq(giftVouchersTable.tenantId, tenantId));

  const txns = await db
    .select()
    .from(giftVoucherTransactionsTable)
    .where(eq(giftVoucherTransactionsTable.tenantId, tenantId));

  // Outstanding = vouchers that can still be redeemed (active or partially
  // redeemed). Cancelled / expired / fully redeemed carry no liability. Use the
  // effective status so a voucher past its expiry date stops counting as a
  // liability even though no background job has flipped its stored status yet.
  const outstanding = vouchers.filter((v) => {
    const s = effectiveVoucherStatus(v);
    return s === "active" || s === "partially_redeemed";
  });
  const outstandingBalance = r2(outstanding.reduce((s, v) => s + Number(v.balance ?? 0), 0));
  const outstandingCount = outstanding.length;

  // Lifetime issued (face value of all non-cancelled vouchers) and redeemed
  // (value drawn down via redemption ledger rows).
  const issuedTotal = r2(
    vouchers
      .filter((v) => v.status !== "cancelled")
      .reduce((s, v) => s + Number(v.originalValue ?? 0), 0),
  );
  const redeemedTotal = r2(
    txns.filter((t) => t.action === "redeem").reduce((s, t) => s + Number(t.amount ?? 0), 0),
  );

  // Per-cashier breakdown. Issuance is attributed to the voucher's issuer;
  // redemption to the ledger row's staff. Merge both into one keyed map.
  type Row = {
    staffName: string;
    issuedCount: number;
    issuedTotal: number;
    redeemedCount: number;
    redeemedTotal: number;
  };
  const byCashier = new Map<string, Row>();
  const row = (name: string): Row => {
    let r = byCashier.get(name);
    if (!r) {
      r = { staffName: name, issuedCount: 0, issuedTotal: 0, redeemedCount: 0, redeemedTotal: 0 };
      byCashier.set(name, r);
    }
    return r;
  };

  for (const v of vouchers) {
    if (v.status === "cancelled") continue;
    const r = row(v.issuedByName?.trim() || "Unknown");
    r.issuedCount += 1;
    r.issuedTotal = r2(r.issuedTotal + Number(v.originalValue ?? 0));
  }
  for (const t of txns) {
    if (t.action !== "redeem") continue;
    const r = row(t.staffName?.trim() || "Unknown");
    r.redeemedCount += 1;
    r.redeemedTotal = r2(r.redeemedTotal + Number(t.amount ?? 0));
  }

  res.json({
    liability: { outstandingBalance, outstandingCount, issuedTotal, redeemedTotal },
    byCashier: Array.from(byCashier.values()).sort((a, b) => b.issuedTotal - a.issuedTotal),
  });
});

/* ─── GET /gift-vouchers/lookup/:code — redemption lookup ──────────────────
 * Registered BEFORE /:id so "lookup" is never parsed as a numeric id.        */
router.get("/gift-vouchers/lookup/:code", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const code = normalizeCode(raw ?? "");
  if (!code) { res.status(400).json({ error: "Code required" }); return; }

  const [v] = await db
    .select()
    .from(giftVouchersTable)
    .where(and(eq(giftVouchersTable.tenantId, tenantId), eq(giftVouchersTable.code, code)));
  if (!v) { res.status(404).json({ error: "Voucher not found" }); return; }

  res.json(LookupGiftVoucherResponse.parse(normalizeVoucher(v)));
});

/* ─── GET /gift-vouchers/:id — voucher with full ledger history ─── */
router.get("/gift-vouchers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw ?? "", 10);
  if (Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [v] = await db
    .select()
    .from(giftVouchersTable)
    .where(and(eq(giftVouchersTable.id, id), eq(giftVouchersTable.tenantId, tenantId)));
  if (!v) { res.status(404).json({ error: "Voucher not found" }); return; }

  const txns = await db
    .select()
    .from(giftVoucherTransactionsTable)
    .where(
      and(
        eq(giftVoucherTransactionsTable.tenantId, tenantId),
        eq(giftVoucherTransactionsTable.voucherId, id),
      ),
    )
    .orderBy(desc(giftVoucherTransactionsTable.createdAt));

  res.json(GetGiftVoucherResponse.parse(normalizeVoucher(v, txns)));
});

export default router;
