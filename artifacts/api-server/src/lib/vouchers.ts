import { randomBytes } from "node:crypto";
import { giftVouchersTable, giftVoucherTransactionsTable } from "@workspace/db";

/* ─── Voucher code generation ─────────────────────────────────────────────
 * Cryptographically random, NOT sequential — a guessable code is guessable
 * money. Unambiguous alphabet (no 0/O/1/I/L) so codes are easy to read aloud
 * and re-key. 16 chars over a 31-symbol alphabet ≈ 79 bits of entropy, so
 * collisions are astronomically unlikely; the unique index is the backstop.   */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateVoucherCode(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/* A voucher stored "active"/"partially_redeemed" but past its expiry date is
 * effectively expired. We surface that on read (reports, list, lookup) without
 * a background job: redemption is already blocked at validation time, this just
 * keeps the displayed status and liability totals honest. */
export function effectiveVoucherStatus(
  v: typeof giftVouchersTable.$inferSelect,
): string {
  if ((v.status === "active" || v.status === "partially_redeemed") && v.expiryDate) {
    if (v.expiryDate.getTime() < Date.now()) return "expired";
  }
  return v.status;
}

function normalizeTxn(t: typeof giftVoucherTransactionsTable.$inferSelect) {
  return {
    ...t,
    relatedOrderId: t.relatedOrderId ?? undefined,
    staffId: t.staffId ?? undefined,
    staffName: t.staffName ?? undefined,
    notes: t.notes ?? undefined,
  };
}

export function normalizeVoucher(
  v: typeof giftVouchersTable.$inferSelect,
  transactions?: (typeof giftVoucherTransactionsTable.$inferSelect)[],
) {
  return {
    ...v,
    status: effectiveVoucherStatus(v),
    customerId: v.customerId ?? undefined,
    customerName: v.customerName ?? undefined,
    customerPhone: v.customerPhone ?? undefined,
    customerEmail: v.customerEmail ?? undefined,
    paymentMethod: v.paymentMethod ?? undefined,
    amountPaid: v.amountPaid ?? undefined,
    notes: v.notes ?? undefined,
    expiryDate: v.expiryDate ?? undefined,
    issuedByStaffId: v.issuedByStaffId ?? undefined,
    issuedByName: v.issuedByName ?? undefined,
    cancelledAt: v.cancelledAt ?? undefined,
    ...(transactions ? { transactions: transactions.map(normalizeTxn) } : {}),
  };
}
