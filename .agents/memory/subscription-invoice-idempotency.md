---
name: Subscription invoice idempotency
description: How auto-issued MicroBooks billing invoices/receipts stay unique per payment across concurrent callbacks.
---

Subscription billing documents (Invoice + Receipt PDFs, emailed on subscribe/renew) are
de-duplicated per `(tenant_id, provider, provider_ref)`.

**The rule:** every payment path that issues a billing document must pass a stable
`providerRef` (paypal capture id, powertranz transaction id, `manual:${paymentId}`),
and dedupe relies on BOTH a check-then-read AND a DB partial unique index
`subscription_invoices_tenant_provider_ref_uidx ... WHERE provider_ref IS NOT NULL`.
The insert uses `onConflictDoNothing().returning()`; an empty result means a concurrent
caller won the race, so re-fetch and return the existing row (no second email).

**Why:** the check-then-insert alone is not race-safe — duplicate provider callbacks or
two concurrent `applyDueManualPayments`/`/saas/me` calls could otherwise create duplicate
invoice rows and send duplicate emails. The unique index is the real guarantee; the
pre-read is just a fast path.

**How to apply:** if you add a NEW payment path that issues a subscription invoice, give it
a unique deterministic `providerRef`. Never pass a null/empty providerRef for a real payment
(the partial index excludes nulls, so null refs are NOT deduped). The index was applied via
raw SQL to BOTH local DATABASE_URL and SUPABASE_DATABASE_URL (api-server uses Supabase).
