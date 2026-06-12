---
name: Gift voucher is a tender, not a discount
description: Invariants for redeeming gift vouchers at POS — money/stock correctness rules that span client and server.
---

# Gift voucher = tender, not discount

A redeemed gift voucher pays down part of the sale **total**. The sale's
subtotal / tax / total are UNCHANGED. The voucher covers `giftVoucherAmount`
and the customer settles the remaining `amountDue = total − giftVoucherAmount`
via the normal payment method. Tax is applied normally on the sale (NO tax
effect at redemption). NO auto journal entries for vouchers.

When a voucher covers the whole sale, the client sends `paymentMethod` as the
sentinel string `"gift_voucher"`.

**Why:** these are the rules a future change can silently break — they are not
discoverable from a single file. Several were live bugs caught in review.

**How to apply — every redemption-touching change must preserve all of:**

1. **Split / partial tenders settle `amountDue`, not `total`.** Any UI or
   server check that a split adds up must compare against `amountDue` whenever a
   voucher is applied, or a partial voucher forces over-collection.
2. **Credit (AR) posts only the unpaid remainder.** When `paymentMethod ===
   "credit"` with a partial voucher, the accounts-receivable row amount is
   `total − giftVoucherAmount`, never the full total.
3. **Server must not trust the `"gift_voucher"` sentinel.** Reject it unless a
   real redeemable voucher actually covers the total
   (`voucherApplied + 0.005 >= total`). Otherwise a crafted request creates a
   free completed order (`isPaid = !!paymentMethod`).
4. **No redemption on open/unpaid orders.** Reject a voucher code on an
   open/dine-in (unpaid) order so balance can't be burned before payment.
5. **Concurrency:** lock the voucher row (`SELECT … FOR UPDATE`) and do
   balance-decrement + status flip + ledger "redeem" row inside the same
   transaction as the order header insert.
6. Redemption is **blocked offline** (server-authoritative row lock).
7. **All three POS layouts (`pos.tsx`, `pos-hardware.tsx`, `pos-supermarket.tsx`)
   must validate a looked-up voucher identically.** Accept `active` AND
   `partially_redeemed` (balance > 0); reject `cancelled`, `redeemed`, expired
   (`expiryDate < now`), and zero-balance. A `status !== "active"` shortcut is a
   bug — it wrongly blocks partially-redeemed vouchers and skips the expiry
   check. `pos.tsx` is the reference; mirror its `handleApplyVoucher` exactly.
