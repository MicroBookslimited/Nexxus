---
name: Receipt timezone setting
description: Tenant-configurable timezone for receipt timestamps; where it lives and the render-site rule.
---

Tenant timezone is an app_settings key `timezone` (IANA id, default "America/Jamaica"), set during onboarding step 2 (PATCH /saas/onboarding upserts it into app_settings — it is NOT a tenants column) and editable in Settings → Business.

**Rule:** every receipt/document date render in `receipt.ts` must pass `timeZone: receiptTimeZone(settings)` (validating helper, falls back to Jamaica). There are SIX render sites: buildReceiptHtml, buildStapleReceiptHtml (Intl.formatToParts), buildWhatsAppText, buildPlainReceiptHtml, buildRefundReceiptHtml (fmtDate), buildBillHtml. A new template must do the same or it silently shows browser-local time.

**Why:** timestamps are stored UTC; without an explicit timeZone, toLocaleString uses the device clock, so misconfigured PCs printed wrong receipt times.

Also: PATCH /saas/onboarding must never spread the raw body into the tenants update — only an allowlist (phone, address, country) is written (mass-assignment protection; flagged by review).
