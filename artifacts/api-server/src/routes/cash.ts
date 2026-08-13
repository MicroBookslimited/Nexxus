import { Router, type IRouter } from "express";
import { eq, and, gte, lte, isNotNull, isNull, or, sql, desc } from "drizzle-orm";
import { db, cashSessionsTable, cashPayoutsTable, cashHandoversTable, ordersTable, orderItemsTable, customersTable, accountsReceivableTable, productsTable, giftVouchersTable, layawayPaymentsTable, staffTable, workOrderPaymentsTable, workOrdersTable, tenantsTable, tenantAdminUsersTable } from "@workspace/db";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { logAudit } from "./audit";
import { getAllSettings } from "./settings";
import { sendMail, getFromDetails } from "../lib/mail";
import { renderEodReportPdf, buildEodReportHtml, type EodReportData } from "../lib/eod-report-doc";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Manager gate for shift-financial reads ───
 * Tenant tokens carry no staff identity, so POS clients identify their staff
 * member via the x-staff-id header. For endpoints that expose shift financials
 * (session history / detail), a request that identifies a staff member must
 * identify a MANAGERIAL one; requests without the header come from the tenant
 * dashboard (owner/admin login) and pass. Technician-restricted tokens are
 * always blocked. Returns true when the request may proceed. */
const MANAGER_ROLES = new Set(["admin", "manager", "supervisor", "owner"]);
export async function allowShiftFinancials(
  req: { headers: Record<string, string | undefined> },
  res: { status: (n: number) => { json: (b: object) => void } },
  tenantId: number,
): Promise<boolean> {
  if (!requireFullTenant(req as never, res)) return false;
  const raw = req.headers["x-staff-id"];
  if (raw == null || raw === "") return true;
  const staffId = parseInt(String(raw), 10);
  const [s] = Number.isFinite(staffId)
    ? await db.select().from(staffTable).where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId))).limit(1)
    : [];
  if (!s || !MANAGER_ROLES.has((s.role ?? "").toLowerCase())) {
    res.status(403).json({ error: "Manager or admin role required for shift reports" });
    return false;
  }
  return true;
}

const OpenSessionBody = z.object({
  staffName: z.string().min(1),
  staffId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  locationName: z.string().optional(),
  stationNumber: z.number().int().min(1).max(10).optional(),
  openingCash: z.number().min(0),
});

const AddPayoutBody = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1),
  staffName: z.string().min(1),
});

const CloseSessionBody = z.object({
  actualCash: z.number().min(0),
  actualCard: z.number().min(0),
  actualOther: z.number().min(0).optional(),
  closingNotes: z.string().optional(),
  denominationBreakdown: z.string().optional(),
});

function computeSales(orders: { paymentMethod: string | null; total: number | null; status: string | null; giftVoucherAmount?: number | null }[]) {
  // Voided orders never completed — exclude from all sales.
  // Refunded orders DID complete as sales first, so include them in gross sales
  // and also track them separately as refunds (net = 0 for that order).
  const notVoided = orders.filter((r) => r.status !== "voided");
  const refunded  = orders.filter((r) => r.status === "refunded");

  // A gift voucher is a tender: the cash/card/credit a drawer actually receives
  // for an order is total − giftVoucherAmount (the voucher pays the rest). Split
  // tenders already store only the non-voucher cash/card portions separately.
  const received = (r: { total: number | null; giftVoucherAmount?: number | null }) =>
    Math.max(0, Number(r.total ?? 0) - Number(r.giftVoucherAmount ?? 0));

  const cashSales   = notVoided.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + received(r), 0);
  const cardSales   = notVoided.filter((r) => r.paymentMethod === "card").reduce((s, r) => s + received(r), 0);
  const splitSales  = notVoided.filter((r) => r.paymentMethod === "split").reduce((s, r) => s + received(r), 0);
  const creditSales = notVoided.filter((r) => r.paymentMethod === "credit").reduce((s, r) => s + received(r), 0);

  const voided = orders.filter((r) => r.status === "voided");

  const refundedCash  = refunded.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + received(r), 0);
  const refundedCard  = refunded.filter((r) => r.paymentMethod === "card").reduce((s, r) => s + received(r), 0);
  const refundedOther = refunded.filter((r) => r.paymentMethod !== "cash" && r.paymentMethod !== "card").reduce((s, r) => s + received(r), 0);
  const totalRefunds  = refundedCash + refundedCard + refundedOther;

  const voidedCount = voided.length;
  const voidedTotal = voided.reduce((s, r) => s + Number(r.total ?? 0), 0);

  return {
    cashSales, cardSales, splitSales, creditSales,
    totalSales: cashSales + cardSales + splitSales + creditSales,
    refundedCash, refundedCard, refundedOther, totalRefunds,
    voidedCount, voidedTotal,
  };
}

async function computeCreditOrders(tenantId: number, from: Date, to: Date) {
  return db
    .select({
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      arId: accountsReceivableTable.id,
      amountPaid: accountsReceivableTable.amountPaid,
      arStatus: accountsReceivableTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(accountsReceivableTable, eq(accountsReceivableTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
        eq(ordersTable.paymentMethod, "credit"),
      )
    )
    .orderBy(desc(ordersTable.createdAt));
}

async function computeItemSummary(tenantId: number, from: Date, to: Date) {
  return db
    .select({
      productName: orderItemsTable.productName,
      sku: productsTable.barcode,
      totalQty: sql<number>`cast(sum(${orderItemsTable.quantity}) as int)`.as("total_qty"),
      totalRevenue: sql<number>`sum(${orderItemsTable.lineTotal})`.as("total_revenue"),
      totalTax: sql<number>`sum(${orderItemsTable.lineTotal} / NULLIF(${ordersTable.subtotal}, 0) * COALESCE(${ordersTable.tax}, 0))`.as("total_tax"),
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
        isNotNull(ordersTable.paymentMethod),
      )
    )
    .groupBy(orderItemsTable.productName, productsTable.barcode)
    .orderBy(sql`sum(${orderItemsTable.quantity}) desc`);
}

/**
 * Net cash collected on layaways (deposits + installment payments − cash
 * refunds on cancellation) during a window. This money enters the drawer but
 * creates no order row until the layaway pays off (and that payoff order uses
 * paymentMethod "layaway", which never counts as cash), so it must be added
 * to expected cash explicitly — same idea as gift-voucher issuance cash.
 */
async function computeLayawayCashIn(
  tenantId: number,
  windowStart: Date,
  windowEnd: Date | null,
  staffId: number | null | undefined,
): Promise<number> {
  const rows = await db
    .select({ amount: layawayPaymentsTable.amount })
    .from(layawayPaymentsTable)
    .where(and(
      eq(layawayPaymentsTable.tenantId, tenantId),
      eq(layawayPaymentsTable.method, "cash"),
      gte(layawayPaymentsTable.createdAt, windowStart),
      ...(windowEnd ? [lte(layawayPaymentsTable.createdAt, windowEnd)] : []),
      ...(staffId ? [eq(layawayPaymentsTable.staffId, staffId)] : []),
    ));
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

/**
 * Money collected on work orders in the field (technician onsite payments)
 * during a window. Same pattern as layaway cash: these payments create no
 * order row, so they must be added to expected cash explicitly. STRICTLY
 * scoped by the collecting staff member — recording a payment requires that
 * staff's own open session, so the money is physically in THEIR drawer. A
 * staffless (tenant-wide office) session must NOT absorb field collections,
 * or the office drawer shows false overages.
 */
async function computeWoTenderIn(
  tenantId: number,
  windowStart: Date,
  windowEnd: Date | null,
  staffId: number | null | undefined,
  method: "cash" | "card" | "transfer",
): Promise<number> {
  if (!staffId) return 0;
  const rows = await db
    .select({ amount: workOrderPaymentsTable.amount })
    .from(workOrderPaymentsTable)
    .where(and(
      eq(workOrderPaymentsTable.tenantId, tenantId),
      eq(workOrderPaymentsTable.method, method),
      gte(workOrderPaymentsTable.createdAt, windowStart),
      ...(windowEnd ? [lte(workOrderPaymentsTable.createdAt, windowEnd)] : []),
      eq(workOrderPaymentsTable.staffId, staffId),
    ));
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

async function computeWoCashIn(
  tenantId: number,
  windowStart: Date,
  windowEnd: Date | null,
  staffId: number | null | undefined,
): Promise<number> {
  return computeWoTenderIn(tenantId, windowStart, windowEnd, staffId, "cash");
}

router.get("/cash/sessions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await allowShiftFinancials(req as never, res, tenantId))) return;

  const sessions = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.tenantId, tenantId))
    .orderBy(sql`${cashSessionsTable.openedAt} desc`);
  res.json(sessions);
});

/* ─── GET /cash/register-report  (Admin / Manager only) ─── */
router.get("/cash/register-report", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { from, to } = req.query as { from?: string; to?: string };

  // Build conditions — show sessions ACTIVE during the range (overlap), not just opened on that day.
  // A session overlaps the range when: openedAt <= rangeEnd AND (closedAt IS NULL OR closedAt >= rangeStart)
  // The frontend sends full ISO datetime strings (timezone-aware), so we use them directly.
  // Fallback: if a plain date string (YYYY-MM-DD) is sent, interpret as UTC end/start of day.
  const parseDate = (s: string, endOfDay = false) =>
    s.includes("T") ? new Date(s) : new Date(`${s}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);

  // Resolve the requested filter window once and reuse for both session
  // selection AND order aggregation. Without this, a long-running open session
  // would show its full lifetime totals on a "Today" pill instead of today's
  // orders only.
  const rangeStart = from ? parseDate(from, false) : null;
  const rangeEnd   = to   ? parseDate(to,   true)  : null;

  const conditions = [eq(cashSessionsTable.tenantId, tenantId)];
  if (rangeEnd) {
    conditions.push(lte(cashSessionsTable.openedAt, rangeEnd));
  }
  if (rangeStart) {
    conditions.push(
      or(
        isNull(cashSessionsTable.closedAt),
        gte(cashSessionsTable.closedAt, rangeStart),
      )!
    );
  }

  const sessions = await db
    .select()
    .from(cashSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(cashSessionsTable.openedAt));

  // For each session aggregate orders by payment method, clipped to the
  // requested filter window so each pill (Today / Yesterday / Week / Month /
  // Custom) reflects only orders that fell inside that window.
  const report = await Promise.all(sessions.map(async (s) => {
    const sessionEnd = s.closedAt ?? new Date();
    // Clip the session's window to the requested filter window.
    const windowStart = rangeStart && rangeStart > s.openedAt ? rangeStart : s.openedAt;
    const windowEnd   = rangeEnd   && rangeEnd   < sessionEnd ? rangeEnd   : sessionEnd;

    // Scope orders to this cashier's staffId so overlapping sessions (multiple
    // simultaneous cashiers) don't bleed into each other's totals.
    const sessionConditions = [
      eq(ordersTable.tenantId, tenantId),
      // Attribute orders by payment time (pay-later orders complete in a later
      // shift); fall back to createdAt for immediate-paid orders. Matches the
      // session-detail and close-session endpoints.
      gte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, windowStart),
      lte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, windowEnd),
      isNotNull(ordersTable.paymentMethod),
      ...(s.staffId ? [eq(ordersTable.staffId, s.staffId)] : []),
    ];

    const orderRows = await db
      .select({
        total: ordersTable.total,
        paymentMethod: ordersTable.paymentMethod,
        status: ordersTable.status,
        splitCashAmount: ordersTable.splitCashAmount,
        splitCardAmount: ordersTable.splitCardAmount,
        giftVoucherAmount: ordersTable.giftVoucherAmount,
      })
      .from(ordersTable)
      .where(and(...sessionConditions));

    const sales = computeSales(orderRows);

    // Cash physically collected when SELLING gift vouchers in this window also
    // enters the drawer, even though issuance creates no order row.
    const voucherIssueConds = [
      eq(giftVouchersTable.tenantId, tenantId),
      eq(giftVouchersTable.paymentMethod, "cash"),
      gte(giftVouchersTable.createdAt, windowStart),
      lte(giftVouchersTable.createdAt, windowEnd),
      ...(s.staffId ? [eq(giftVouchersTable.issuedByStaffId, s.staffId)] : []),
    ];
    const issuedVouchers = await db
      .select({ amountPaid: giftVouchersTable.amountPaid, originalValue: giftVouchersTable.originalValue })
      .from(giftVouchersTable)
      .where(and(...voucherIssueConds));
    const voucherCashIn = issuedVouchers.reduce(
      (acc, v) => acc + Number(v.amountPaid ?? v.originalValue ?? 0),
      0,
    );

    // Layaway deposits/installments collected in cash also enter the drawer.
    const layawayCashIn = await computeLayawayCashIn(tenantId, windowStart, windowEnd, s.staffId);
    // Cash collected onsite on work orders (field technicians) too.
    const woCashIn = await computeWoCashIn(tenantId, windowStart, windowEnd, s.staffId);

    // For split payments, attribute each portion to its correct column so
    // Cash and Card Slips totals reflect exactly what each tender received.
    const notVoided = orderRows.filter(r => r.status !== "voided");
    const splitCash = notVoided
      .filter(r => r.paymentMethod === "split")
      .reduce((s, r) => s + Number(r.splitCashAmount ?? 0), 0);
    const splitCard = notVoided
      .filter(r => r.paymentMethod === "split")
      .reduce((s, r) => s + Number(r.splitCardAmount ?? 0), 0);

    // Payouts for this session (needed for expectedCash)
    const sessionPayouts = await db
      .select({ amount: cashPayoutsTable.amount })
      .from(cashPayoutsTable)
      .where(eq(cashPayoutsTable.sessionId, s.id));
    const totalPayouts = sessionPayouts.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);

    const openingCash = Number(s.openingCash ?? 0);
    const actualCash  = s.actualCash  != null ? Number(s.actualCash)  : null;
    const actualCard  = s.actualCard  != null ? Number(s.actualCard)  : null;

    const expectedCash = openingCash
      + (sales.cashSales - sales.refundedCash)
      + splitCash
      + voucherCashIn
      + layawayCashIn
      + woCashIn
      - totalPayouts;

    return {
      id:           s.id,
      openedAt:     s.openedAt,
      closedAt:     s.closedAt,
      status:       s.status,
      staffId:      s.staffId ?? null,
      staffName:    s.staffName,
      locationName: s.locationName,
      openingCash,
      actualCash,
      actualCard,
      // Cash from selling gift vouchers (issuance) also lands in the drawer.
      voucherCashIn,
      // Cash collected on layaways (deposits/installments, net of cash refunds).
      layawayCashIn,
      // Cash collected onsite on work orders by this staff member.
      woCashIn,
      // Cash = pure cash orders + cash portion of split payments + voucher sales + layaway cash + work-order cash
      cashSales:    sales.cashSales - sales.refundedCash + splitCash + voucherCashIn + layawayCashIn + woCashIn,
      // Card = pure card orders + card portion of split payments
      cardSales:    sales.cardSales - sales.refundedCard + splitCard,
      creditSales:  sales.creditSales,
      // Split total kept for audit trail but cash/card already broken out above
      splitSales:   sales.splitSales,
      totalSales:   sales.totalSales - sales.totalRefunds,
      refunds:      sales.totalRefunds,
      orderCount:   orderRows.filter(r => r.status !== "voided").length,
      voidedCount:  sales.voidedCount,
      totalPayouts,
      expectedCash,
    };
  }));

  res.json(report);
});

router.get("/cash/sessions/current", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Use x-staff-id header to scope the session to the requesting cashier.
  // This allows multiple cashiers to have simultaneous open sessions.
  const staffIdHeader = (req as never as { headers: { "x-staff-id"?: string } }).headers["x-staff-id"];
  const staffId = staffIdHeader ? parseInt(staffIdHeader) : null;

  const whereClause = staffId && !isNaN(staffId)
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.staffId, staffId))
    : and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId));

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(whereClause)
    .orderBy(sql`${cashSessionsTable.openedAt} desc`)
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "No open session" });
    return;
  }

  const payouts = await db
    .select()
    .from(cashPayoutsTable)
    .where(eq(cashPayoutsTable.sessionId, session.id))
    .orderBy(cashPayoutsTable.createdAt);

  const orderRows = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      splitCashAmount: ordersTable.splitCashAmount,
      giftVoucherAmount: ordersTable.giftVoucherAmount,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        // Attribute orders to the session by PAYMENT time, not creation time.
        // Pay-later (kitchen) orders get their paymentMethod when charged —
        // possibly during a later shift. Using createdAt retroactively inflated
        // the creating shift's expected cash (false shortages). completedAt is
        // set at charge time; fall back to createdAt for immediate-paid orders.
        gte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, session.openedAt),
        isNotNull(ordersTable.paymentMethod),
        ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  // Cash portion of split payments; refunded splits returned their cash to the
  // customer, so exclude them (mirrors how refundedCash is netted out above).
  const splitCashSales = orderRows
    .filter(r => r.status !== "voided" && r.status !== "refunded" && r.paymentMethod === "split")
    .reduce((s, r) => s + Number(r.splitCashAmount ?? 0), 0);
  // Cash collected from selling gift vouchers (issuance) also lands in the drawer.
  const issuedVouchers = await db
    .select({ amountPaid: giftVouchersTable.amountPaid, originalValue: giftVouchersTable.originalValue })
    .from(giftVouchersTable)
    .where(and(
      eq(giftVouchersTable.tenantId, tenantId),
      eq(giftVouchersTable.paymentMethod, "cash"),
      gte(giftVouchersTable.createdAt, session.openedAt),
      ...(session.staffId ? [eq(giftVouchersTable.issuedByStaffId, session.staffId)] : []),
    ));
  const voucherCashIn = issuedVouchers.reduce((s, v) => s + Number(v.amountPaid ?? v.originalValue ?? 0), 0);
  // Layaway deposits/installments collected in cash also enter the drawer.
  const layawayCashIn = await computeLayawayCashIn(tenantId, session.openedAt, null, session.staffId);
  const woCashIn = await computeWoCashIn(tenantId, session.openedAt, null, session.staffId);
  // Card/transfer taken in the field (mobile card machine): not drawer cash,
  // but the close screen needs them to declare actualCard/actualOther honestly.
  const woCardIn = await computeWoTenderIn(tenantId, session.openedAt, null, session.staffId, "card");
  const woTransferIn = await computeWoTenderIn(tenantId, session.openedAt, null, session.staffId, "transfer");
  // Expected = opening float + net cash sales (pure cash, net of refunds) + split cash portions + voucher cash + layaway cash + work-order onsite cash − payouts
  const expectedCash = session.openingCash + (salesSummary.cashSales - salesSummary.refundedCash) + splitCashSales + voucherCashIn + layawayCashIn + woCashIn - totalPayouts;
  const itemSummary = await computeItemSummary(tenantId, session.openedAt, new Date());
  const creditOrders = await computeCreditOrders(tenantId, session.openedAt, new Date());

  res.json({ session, payouts, orders: orderRows, salesSummary, expectedCash, totalPayouts, splitCashSales, voucherCashIn, layawayCashIn, woCashIn, woCardIn, woTransferIn, itemSummary, creditOrders });
});

/* ─── Onsite job payments (technician transaction list) ───
 * A field technician takes no POS orders, so their shift's "transactions" are
 * the work-order payments they collected. Same staff/window scoping as the
 * money totals so the list always reconciles with expected cash. */
async function computeWoPaymentList(
  tenantId: number,
  windowStart: Date,
  windowEnd: Date | null,
  staffId: number | null | undefined,
) {
  if (!staffId) return [];
  return db
    .select({
      amount: workOrderPaymentsTable.amount,
      method: workOrderPaymentsTable.method,
      reference: workOrderPaymentsTable.reference,
      createdAt: workOrderPaymentsTable.createdAt,
      workOrderNumber: workOrdersTable.workOrderNumber,
      customerName: customersTable.name,
    })
    .from(workOrderPaymentsTable)
    .leftJoin(workOrdersTable, eq(workOrderPaymentsTable.workOrderId, workOrdersTable.id))
    .leftJoin(customersTable, eq(workOrdersTable.customerId, customersTable.id))
    .where(and(
      eq(workOrderPaymentsTable.tenantId, tenantId),
      eq(workOrderPaymentsTable.staffId, staffId),
      gte(workOrderPaymentsTable.createdAt, windowStart),
      ...(windowEnd ? [lte(workOrderPaymentsTable.createdAt, windowEnd)] : []),
    ))
    .orderBy(workOrderPaymentsTable.createdAt);
}

/* ─── Shared end-of-day report ───
 * Everything one shift's report needs: sales, payouts, onsite job payments,
 * cash reconciliation and the cash-custody record. Used by the session-detail
 * route, the PDF/email renderers and the technician app. */
export async function buildSessionReport(
  tenantId: number,
  session: typeof cashSessionsTable.$inferSelect,
) {
  const id = session.id;
  const payouts = await db
    .select()
    .from(cashPayoutsTable)
    .where(eq(cashPayoutsTable.sessionId, id))
    .orderBy(cashPayoutsTable.createdAt);

  const closedAt = session.closedAt ?? new Date();

  const orderRows = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      splitCashAmount: ordersTable.splitCashAmount,
      giftVoucherAmount: ordersTable.giftVoucherAmount,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        // Attribute by PAYMENT time (see open-session route above): pay-later
        // orders charged in a later shift must not count toward this shift.
        gte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, session.openedAt),
        lte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, closedAt),
        isNotNull(ordersTable.paymentMethod),
        ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const splitCashSales = orderRows
    .filter(r => r.status !== "voided" && r.status !== "refunded" && r.paymentMethod === "split")
    .reduce((s, r) => s + Number(r.splitCashAmount ?? 0), 0);
  // Cash collected from selling gift vouchers (issuance) also lands in the drawer.
  const issuedVouchers = await db
    .select({ amountPaid: giftVouchersTable.amountPaid, originalValue: giftVouchersTable.originalValue })
    .from(giftVouchersTable)
    .where(and(
      eq(giftVouchersTable.tenantId, tenantId),
      eq(giftVouchersTable.paymentMethod, "cash"),
      gte(giftVouchersTable.createdAt, session.openedAt),
      lte(giftVouchersTable.createdAt, closedAt),
      ...(session.staffId ? [eq(giftVouchersTable.issuedByStaffId, session.staffId)] : []),
    ));
  const voucherCashIn = issuedVouchers.reduce((s, v) => s + Number(v.amountPaid ?? v.originalValue ?? 0), 0);
  // Layaway deposits/installments collected in cash also enter the drawer.
  const layawayCashIn = await computeLayawayCashIn(tenantId, session.openedAt, closedAt, session.staffId);
  const woCashIn = await computeWoTenderIn(tenantId, session.openedAt, closedAt, session.staffId, "cash");
  const woCardIn = await computeWoTenderIn(tenantId, session.openedAt, closedAt, session.staffId, "card");
  const woTransferIn = await computeWoTenderIn(tenantId, session.openedAt, closedAt, session.staffId, "transfer");
  const expectedCash = session.openingCash + (salesSummary.cashSales - salesSummary.refundedCash) + splitCashSales + voucherCashIn + layawayCashIn + woCashIn - totalPayouts;
  const itemSummary = await computeItemSummary(tenantId, session.openedAt, closedAt);
  const creditOrders = await computeCreditOrders(tenantId, session.openedAt, closedAt);
  const woPayments = await computeWoPaymentList(tenantId, session.openedAt, closedAt, session.staffId);
  const [handover] = await db
    .select()
    .from(cashHandoversTable)
    .where(and(eq(cashHandoversTable.tenantId, tenantId), eq(cashHandoversTable.sessionId, id)));

  return {
    session, payouts, orders: orderRows, salesSummary, expectedCash, totalPayouts,
    splitCashSales, voucherCashIn, layawayCashIn, woCashIn, woCardIn, woTransferIn,
    itemSummary, creditOrders, woPayments, handover: handover ?? null,
  };
}

/* ─── Own-shift-or-manager gate ───
 * The technician app carries a technician-restricted tenant token, which the
 * manager gate rejects outright. A technician may still read (and print/email)
 * THEIR OWN shift report, identified by the x-staff-id header; every other
 * caller has to clear the normal manager gate. */
async function allowSessionReport(
  req: { headers: Record<string, string | undefined> },
  res: { status: (n: number) => { json: (b: object) => void } },
  tenantId: number,
  session: typeof cashSessionsTable.$inferSelect,
): Promise<boolean> {
  const raw = req.headers["x-staff-id"];
  const staffId = raw ? parseInt(String(raw), 10) : NaN;
  if (Number.isFinite(staffId) && session.staffId != null && staffId === session.staffId) return true;
  return allowShiftFinancials(req, res, tenantId);
}

router.get("/cash/sessions/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) {
    // Run the manager gate before revealing whether the shift exists.
    if (!(await allowShiftFinancials(req as never, res, tenantId))) return;
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!(await allowSessionReport(req as never, res, tenantId, session))) return;

  res.json(await buildSessionReport(tenantId, session));
});

router.post("/cash/sessions", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = OpenSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  // Scope conflict check to this specific cashier (staffId) so multiple
  // cashiers can each have their own simultaneous open session.
  const incomingStaffId = parsed.data.staffId ?? null;
  const conflictWhere = incomingStaffId
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.staffId, incomingStaffId))
    : and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId));

  const existing = await db
    .select()
    .from(cashSessionsTable)
    .where(conflictWhere)
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "A session is already open", sessionId: existing[0].id });
    return;
  }

  const [session] = await db
    .insert(cashSessionsTable)
    .values({
      tenantId,
      staffName: parsed.data.staffName,
      staffId: incomingStaffId,
      locationId: parsed.data.locationId ?? null,
      locationName: parsed.data.locationName ?? null,
      stationNumber: parsed.data.stationNumber ?? null,
      openingCash: parsed.data.openingCash,
      status: "open",
    })
    .returning();

  await logAudit({ tenantId, staffId: incomingStaffId, staffName: parsed.data.staffName, action: "cash.session.open", entityType: "cash_session", entityId: session?.id, details: { openingCash: parsed.data.openingCash, location: parsed.data.locationName } });
  res.status(201).json(session);
});

/* ─── Session ownership guard ───
 * A request that identifies a NON-managerial staff member (x-staff-id) may
 * only touch that staff member's own session. Requests without the header
 * (web POS office/dashboard) and managerial staff are unrestricted — matches
 * the existing web POS behavior while blocking a technician from paying out
 * of or closing someone else's drawer. */
async function allowSessionMutation(
  req: { headers: Record<string, string | undefined> },
  res: { status: (n: number) => { json: (b: object) => void } },
  tenantId: number,
  session: { staffId: number | null },
): Promise<boolean> {
  const raw = req.headers["x-staff-id"];
  if (raw == null || raw === "") return true;
  const staffId = parseInt(String(raw), 10);
  const [s] = Number.isFinite(staffId)
    ? await db.select({ id: staffTable.id, role: staffTable.role }).from(staffTable)
        .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId))).limit(1)
    : [];
  if (!s) { res.status(403).json({ error: "Unknown staff member" }); return false; }
  if (MANAGER_ROLES.has((s.role ?? "").trim().toLowerCase())) return true;
  if (session.staffId !== s.id) {
    res.status(403).json({ error: "This shift belongs to another staff member" });
    return false;
  }
  return true;
}

router.post("/cash/sessions/:id/payouts", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const parsed = AddPayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }
  if (!(await allowSessionMutation(req as never, res, tenantId, session))) return;

  const [payout] = await db
    .insert(cashPayoutsTable)
    .values({
      sessionId: id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      staffName: parsed.data.staffName,
    })
    .returning();

  await logAudit({ tenantId, staffName: parsed.data.staffName, action: "cash.payout", entityType: "cash_session", entityId: id, details: { amount: parsed.data.amount, reason: parsed.data.reason } });
  res.status(201).json(payout);
});

/* Force-close any stuck open session for this tenant (manager recovery) */
router.post("/cash/sessions/force-close", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [existing] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)))
    .orderBy(sql`${cashSessionsTable.openedAt} desc`)
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "No open session found" });
    return;
  }

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: existing.openingCash,
      closingNotes: "Force-closed by manager to recover stuck session",
    })
    .where(and(eq(cashSessionsTable.id, existing.id), eq(cashSessionsTable.tenantId, tenantId)))
    .returning();

  res.json(closed);
});

router.post("/cash/sessions/:id/close", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const parsed = CloseSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }
  if (!(await allowSessionMutation(req as never, res, tenantId, session))) return;

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: parsed.data.actualCash,
      actualCard: parsed.data.actualCard,
      actualOther: parsed.data.actualOther ?? 0,
      closingNotes: parsed.data.closingNotes ?? null,
      denominationBreakdown: parsed.data.denominationBreakdown ?? null,
    })
    // Still-open predicate inside the UPDATE: if another device closed this
    // shift a moment ago, this one must lose rather than overwrite its
    // counted cash (and raise a second handover for the same money).
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.status, "open")))
    .returning();

  if (!closed) { res.status(409).json({ error: "This shift has already been closed" }); return; }

  await logAudit({ tenantId, staffId: session.staffId, staffName: session.staffName, action: "cash.session.close", entityType: "cash_session", entityId: id, details: { actualCash: parsed.data.actualCash, actualCard: parsed.data.actualCard } });

  // A technician walks away with the counted cash, so record who holds it
  // until someone signs for it, and send the office the end-of-day report.
  const handover = await ensureHandoverForSession(tenantId, closed, parsed.data.actualCash);
  void sendEodReportEmail(tenantId, id).catch((err) => {
    logger.error({ err, sessionId: id }, "Automatic end-of-day report email failed");
  });

  res.json({ ...closed, handover });
});

/* ─── POST /cash/sessions/:id/admin-close — manager force-closes any session ─── */
router.post("/cash/sessions/:id/admin-close", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.status, "open")));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }

  // Compute expected cash so we can close with reasonable actuals
  const payouts = await db.select().from(cashPayoutsTable).where(eq(cashPayoutsTable.sessionId, id));
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);

  const orderRows = await db
    .select({ paymentMethod: ordersTable.paymentMethod, total: ordersTable.total, status: ordersTable.status, splitCashAmount: ordersTable.splitCashAmount })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      // Attribute by PAYMENT time (see open-session route above).
      gte(sql`COALESCE(${ordersTable.completedAt}, ${ordersTable.createdAt})`, session.openedAt),
      isNotNull(ordersTable.paymentMethod),
      ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
    ));

  const sales = computeSales(orderRows);
  const splitCashSales = orderRows
    .filter(r => r.status !== "voided" && r.status !== "refunded" && r.paymentMethod === "split")
    .reduce((s, r) => s + Number(r.splitCashAmount ?? 0), 0);
  // Layaway deposits/installments collected in cash also enter the drawer.
  const layawayCashIn = await computeLayawayCashIn(tenantId, session.openedAt, null, session.staffId);
  const woCashIn = await computeWoCashIn(tenantId, session.openedAt, null, session.staffId);
  const expectedCash = session.openingCash + (sales.cashSales - sales.refundedCash) + splitCashSales + layawayCashIn + woCashIn - totalPayouts;

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: expectedCash,
      actualCard: sales.cardSales - sales.refundedCard,
      actualOther: 0,
      closingNotes: (req.body as any).notes ?? "Closed by manager",
    })
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)))
    .returning();

  res.json(closed);
});

/* ═══ End-of-day report: PDF, email and cash custody ═══════════════════════ */

const MANAGER_OR_RECEIVER_MSG = "Only an admin, manager or an authorised cash receiver can sign for cash";

async function loadReportContext(tenantId: number) {
  const settings = await getAllSettings(tenantId);
  return {
    businessName: settings["business_name"] ?? "NEXXUS",
    timeZone: settings["timezone"] ?? null,
    currencySymbol: settings["currency_symbol"] ?? "$",
    logo: null as Buffer | null,
  };
}

type SessionReport = Awaited<ReturnType<typeof buildSessionReport>>;

function toEodDocData(r: SessionReport): EodReportData {
  return {
    session: {
      id: r.session.id,
      staffName: r.session.staffName,
      locationName: r.session.locationName,
      openingCash: r.session.openingCash,
      openedAt: r.session.openedAt,
      closedAt: r.session.closedAt,
      status: r.session.status,
      actualCash: r.session.actualCash,
      actualCard: r.session.actualCard,
      actualOther: r.session.actualOther,
      closingNotes: r.session.closingNotes,
      denominationBreakdown: r.session.denominationBreakdown,
    },
    salesSummary: r.salesSummary,
    payouts: r.payouts.map((p) => ({ amount: p.amount, reason: p.reason, staffName: p.staffName, createdAt: p.createdAt })),
    orders: r.orders.map((o) => ({ orderNumber: o.orderNumber, total: o.total, paymentMethod: o.paymentMethod, status: o.status, createdAt: o.createdAt })),
    woPayments: r.woPayments.map((w) => ({
      amount: w.amount, method: w.method, reference: w.reference, createdAt: w.createdAt,
      workOrderNumber: w.workOrderNumber, customerName: w.customerName,
    })),
    expectedCash: r.expectedCash,
    totalPayouts: r.totalPayouts,
    splitCashSales: r.splitCashSales,
    voucherCashIn: r.voucherCashIn,
    layawayCashIn: r.layawayCashIn,
    woCashIn: r.woCashIn,
    woCardIn: r.woCardIn,
    woTransferIn: r.woTransferIn,
    handover: r.handover
      ? {
          status: r.handover.status,
          amount: r.handover.amount,
          receivedAmount: r.handover.receivedAmount,
          receivedByName: r.handover.receivedByName,
          signature: r.handover.signature,
          signedAt: r.handover.signedAt,
          notes: r.handover.notes,
        }
      : null,
  };
}

/** Admin recipients allowed to receive shift financials for this tenant. */
async function tenantAdminEmails(tenantId: number): Promise<string[]> {
  const [tenantRow] = await db.select({ email: tenantsTable.email }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  const adminRows = await db.select({ email: tenantAdminUsersTable.email }).from(tenantAdminUsersTable).where(eq(tenantAdminUsersTable.tenantId, tenantId));
  const set = new Set<string>();
  for (const e of [tenantRow?.email, ...adminRows.map((r) => r.email)]) {
    if (e?.trim()) set.add(e.trim().toLowerCase());
  }
  return [...set];
}

/**
 * Renders the report and mails it (PDF attached) to the tenant's admins, or to
 * an explicit subset of them. Shift financials never go to an outside address.
 */
export async function sendEodReportEmail(
  tenantId: number,
  sessionId: number,
  to?: string[],
): Promise<{ sent: string[]; skipped: string[] }> {
  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, sessionId), eq(cashSessionsTable.tenantId, tenantId)));
  if (!session) throw new Error("Session not found");

  const allowed = await tenantAdminEmails(tenantId);
  const requested = (to && to.length > 0 ? to.map((e) => e.trim().toLowerCase()) : allowed);
  const recipients = requested.filter((e) => allowed.includes(e));
  const skipped = requested.filter((e) => !allowed.includes(e));
  if (recipients.length === 0) return { sent: [], skipped };

  const report = await buildSessionReport(tenantId, session);
  const ctx = await loadReportContext(tenantId);
  const data = toEodDocData(report);
  const html = buildEodReportHtml(data, ctx);
  const pdf = await renderEodReportPdf(data, ctx);
  const { fromAddress, fromName } = await getFromDetails(tenantId);
  const dateLabel = new Date(session.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const filename = `End-of-Day-${session.staffName.replace(/[^A-Za-z0-9]+/g, "-")}-${session.id}.pdf`;

  const sent: string[] = [];
  for (const address of recipients) {
    await sendMail({
      to: address,
      subject: `End of Day Report — ${dateLabel} (${session.staffName})`,
      html,
      fromName,
      fromAddress,
      tenantId,
      attachments: [{ filename, content: pdf, mimeType: "application/pdf" }],
    });
    sent.push(address);
  }
  return { sent, skipped };
}

/**
 * Records that a technician still physically holds the counted cash after
 * closing. One row per shift (unique on session_id), so a retried or repeated
 * close can never raise the custody record twice.
 */
async function ensureHandoverForSession(
  tenantId: number,
  session: typeof cashSessionsTable.$inferSelect,
  amount: number,
) {
  if (!session.staffId || !(amount > 0)) return null;
  const [staff] = await db
    .select({ isTechnician: staffTable.isTechnician })
    .from(staffTable)
    .where(and(eq(staffTable.id, session.staffId), eq(staffTable.tenantId, tenantId)));
  if (!staff?.isTechnician) return null;

  const [row] = await db
    .insert(cashHandoversTable)
    .values({
      tenantId,
      sessionId: session.id,
      staffId: session.staffId,
      staffName: session.staffName,
      amount,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(cashHandoversTable)
    .where(and(eq(cashHandoversTable.tenantId, tenantId), eq(cashHandoversTable.sessionId, session.id)));
  return existing ?? null;
}

/** Staff who may sign for cash: managerial roles, or anyone flagged as a receiver. */
function isCashReceiver(staff: { role: string | null; canReceiveCash: boolean | null }): boolean {
  return MANAGER_ROLES.has((staff.role ?? "").toLowerCase()) || staff.canReceiveCash === true;
}

function reportLinkSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required to sign report download links");
  return secret;
}

/* ─── GET /cash/sessions/:id/report.pdf ───
 * Authenticated by the normal tenant token, or by the short-lived `t` token
 * minted by /report-link (so a phone can open the PDF in its browser). */
router.get("/cash/sessions/:id/report.pdf", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  let tenantId: number | null = null;
  let linkAuthorised = false;
  const linkToken = typeof req.query["t"] === "string" ? req.query["t"] : null;
  if (linkToken) {
    try {
      const payload = jwt.verify(linkToken, reportLinkSecret()) as { tenantId?: number; sessionId?: number; kind?: string };
      if (payload.kind === "eod-report" && payload.sessionId === id && payload.tenantId) {
        tenantId = payload.tenantId;
        linkAuthorised = true;
      }
    } catch {
      // Fall through to header auth / 401 below.
    }
  }
  if (!linkAuthorised) tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!linkAuthorised && !(await allowSessionReport(req as never, res, tenantId, session))) return;

  const report = await buildSessionReport(tenantId, session);
  const ctx = await loadReportContext(tenantId);
  const pdf = await renderEodReportPdf(toEodDocData(report), ctx);
  const filename = `End-of-Day-${session.staffName.replace(/[^A-Za-z0-9]+/g, "-")}-${session.id}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdf);
});

/* ─── POST /cash/sessions/:id/report-link — short-lived PDF download URL ─── */
router.post("/cash/sessions/:id/report-link", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!(await allowSessionReport(req as never, res, tenantId, session))) return;

  let token: string;
  try {
    token = jwt.sign({ tenantId, sessionId: id, kind: "eod-report" }, reportLinkSecret(), { expiresIn: "15m" });
  } catch {
    res.status(500).json({ error: "Report links are unavailable — server signing key is not configured" });
    return;
  }
  const headers = req.headers as Record<string, string | undefined>;
  const proto = headers["x-forwarded-proto"]?.split(",")[0] ?? "https";
  const host = headers["x-forwarded-host"]?.split(",")[0] ?? headers["host"];
  res.json({
    url: `${proto}://${host}/api/cash/sessions/${id}/report.pdf?t=${encodeURIComponent(token)}`,
    expiresInSeconds: 15 * 60,
  });
});

/* ─── POST /cash/sessions/:id/email-report ─── */
const EmailReportBody = z.object({ to: z.array(z.string().email()).max(20).optional() });

router.post("/cash/sessions/:id/email-report", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const parsed = EmailReportBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!(await allowSessionReport(req as never, res, tenantId, session))) return;

  try {
    const result = await sendEodReportEmail(tenantId, id, parsed.data.to);
    if (result.sent.length === 0) {
      res.status(400).json({ error: "No admin email address is on file for this business", skipped: result.skipped });
      return;
    }
    res.json({ success: true, ...result });
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    logger.error({ err, sessionId: id }, "End-of-day report email failed");
    res.status(500).json({ error: "Failed to send the report", details });
  }
});

/* ─── GET /cash/handovers — cash still held by technicians ─── */
router.get("/cash/handovers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const statusFilter = typeof req.query["status"] === "string" ? req.query["status"] : "pending";
  const raw = (req.headers as Record<string, string | undefined>)["x-staff-id"];
  const staffId = raw ? parseInt(String(raw), 10) : NaN;

  let scopeToStaffId: number | null = null;
  if (Number.isFinite(staffId)) {
    const [staff] = await db
      .select({ role: staffTable.role, canReceiveCash: staffTable.canReceiveCash })
      .from(staffTable)
      .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
    if (!staff) { res.status(403).json({ error: "Unknown staff member" }); return; }
    // A technician sees only their own custody; receivers/managers see all.
    if (!isCashReceiver(staff)) scopeToStaffId = staffId;
  } else {
    // No staff identity — office dashboard. Technician tokens are blocked.
    if (!requireFullTenant(req as never, res as never)) return;
  }

  const rows = await db
    .select({
      id: cashHandoversTable.id,
      sessionId: cashHandoversTable.sessionId,
      staffId: cashHandoversTable.staffId,
      staffName: cashHandoversTable.staffName,
      amount: cashHandoversTable.amount,
      status: cashHandoversTable.status,
      receivedAmount: cashHandoversTable.receivedAmount,
      receivedByStaffId: cashHandoversTable.receivedByStaffId,
      receivedByName: cashHandoversTable.receivedByName,
      notes: cashHandoversTable.notes,
      signedAt: cashHandoversTable.signedAt,
      createdAt: cashHandoversTable.createdAt,
      openedAt: cashSessionsTable.openedAt,
      closedAt: cashSessionsTable.closedAt,
      locationName: cashSessionsTable.locationName,
    })
    .from(cashHandoversTable)
    .innerJoin(cashSessionsTable, eq(cashHandoversTable.sessionId, cashSessionsTable.id))
    .where(and(
      eq(cashHandoversTable.tenantId, tenantId),
      ...(statusFilter && statusFilter !== "all" ? [eq(cashHandoversTable.status, statusFilter)] : []),
      ...(scopeToStaffId != null ? [eq(cashHandoversTable.staffId, scopeToStaffId)] : []),
    ))
    .orderBy(desc(cashHandoversTable.createdAt));

  res.json(rows);
});

/* ─── GET /cash/handovers/receivers — who may sign for cash ─── */
router.get("/cash/handovers/receivers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role, canReceiveCash: staffTable.canReceiveCash })
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenantId), eq(staffTable.isActive, true)))
    .orderBy(staffTable.name);

  res.json(rows.filter(isCashReceiver).map((r) => ({ id: r.id, name: r.name, role: r.role })));
});

/* ─── POST /cash/handovers/:id/sign — receiver signs for the cash ─── */
const SignHandoverBody = z.object({
  receivedByStaffId: z.number().int().positive(),
  pin: z.string().min(4).max(8),
  signature: z.string().max(400_000).optional(),
  receivedAmount: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
});

router.post("/cash/handovers/:id/sign", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid handover id" }); return; }

  const parsed = SignHandoverBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error.issues }); return; }

  const [signer] = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role, pin: staffTable.pin, canReceiveCash: staffTable.canReceiveCash, isActive: staffTable.isActive })
    .from(staffTable)
    .where(and(eq(staffTable.id, parsed.data.receivedByStaffId), eq(staffTable.tenantId, tenantId)));
  if (!signer || !signer.isActive) { res.status(404).json({ error: "Staff member not found" }); return; }
  if (!isCashReceiver(signer)) { res.status(403).json({ error: MANAGER_OR_RECEIVER_MSG }); return; }
  if (signer.pin !== parsed.data.pin) { res.status(401).json({ error: "Invalid PIN" }); return; }

  // Lock the row so two devices can't both sign for the same cash.
  const signed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(cashHandoversTable)
      .where(and(eq(cashHandoversTable.id, id), eq(cashHandoversTable.tenantId, tenantId)))
      .for("update");
    if (!row) return { error: "notfound" as const };
    if (row.status === "signed") return { error: "already" as const, row };
    if (row.staffId === signer.id) return { error: "self" as const };

    const [updated] = await tx
      .update(cashHandoversTable)
      .set({
        status: "signed",
        receivedAmount: parsed.data.receivedAmount ?? row.amount,
        receivedByStaffId: signer.id,
        receivedByName: signer.name,
        signature: parsed.data.signature ?? null,
        notes: parsed.data.notes ?? null,
        signedAt: new Date(),
      })
      .where(and(eq(cashHandoversTable.id, id), eq(cashHandoversTable.status, "pending")))
      .returning();
    return { row: updated };
  });

  if ("error" in signed && signed.error === "notfound") { res.status(404).json({ error: "Handover not found" }); return; }
  if ("error" in signed && signed.error === "already") { res.status(409).json({ error: "This cash has already been signed for", handover: signed.row }); return; }
  if ("error" in signed && signed.error === "self") { res.status(403).json({ error: "The technician holding the cash cannot sign for it" }); return; }

  await logAudit({
    tenantId,
    staffId: signer.id,
    staffName: signer.name,
    action: "cash.handover.sign",
    entityType: "cash_handover",
    entityId: id,
    details: { amount: signed.row?.receivedAmount, from: signed.row?.staffName, sessionId: signed.row?.sessionId },
  });

  res.json(signed.row);
});

export default router;
