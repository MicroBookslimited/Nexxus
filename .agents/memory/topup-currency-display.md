---
name: Ding top-up amount display currency
description: Which currency/field the phone top-up UI shows vs. what accounting/transfer actually use.
---

**Wallet-vs-cost unit mismatch (pre-existing):** the top-up "insufficient balance" gate compares `wallet.balance` (JMD) against `cost`/`SenderFee` (USD, = Ding SendValue) in BOTH the frontend and the `/topup/send` deduction path, so affordability decisions and the debit can be off by the FX rate.
**Why:** Ding prices in USD but the wallet is denominated in JMD; the two are compared without conversion.
**How to apply:** convert cost→JMD via `topup_jmd_per_usd` before comparing/deducting. Out of scope for display-only work; needs its own task.

Top-up denomination/"suggested" amounts are displayed in the tenant's HOME currency using Ding's `ReceiveValue` (+ `ReceiveValueMin/Max` for range SKUs) — the credit delivered to the recipient's phone in the recipient's local currency, which for domestic JM top-ups equals `base_currency` (JMD).

**Why:** users found USD `SendValue` (the wholesale cost) confusing on the amount buttons; they want to see what the customer's phone receives, in home currency.

**How to apply:**
- Display everywhere the selected amount is shown (buttons, header, custom input, ready summary, confirm dialog, phone preview, voucher, result) uses the receive amount/currency.
- Wallet debit / cost / commission still use `SendValue`/`SenderFee` (USD). Do NOT re-point accounting at ReceiveValue.
- Ding `SendTransfer` uses ONLY `ProductSkuCode`, so changing displayed value fields cannot affect the actual transfer.
- Range SKUs: the custom amount is entered in home (receive) currency and converted back to send currency via `ratio = SendValue/ReceiveValue` for the payload only (guard ratio when ReceiveValue is 0).
- History list/cards intentionally stay on `sendValue`: legacy `topup_transactions` rows stored a USD number in `benefitValue` mislabeled with a JMD `benefitCurrency`, so rendering benefit fields would corrupt old-record display. Only switch history to benefit fields after a data backfill.
