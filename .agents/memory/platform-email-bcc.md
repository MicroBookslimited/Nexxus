---
name: Platform email BCC
description: Which emails get BCC'd to the accounts inbox and how the gating works
---
Rule: platform-level emails (subscription/billing, auth, support, expiry reminders, superadmin sends) are BCC'd to accounts@microbookssolutions.com. Tenant→customer emails (receipts, loyalty/marketing, tenant daily digest / low-stock reports, Resend marketing campaigns) are NEVER copied.

**Why:** user explicitly scoped the copy to platform emails only; copying tenant reports/marketing would leak tenant business data and flood the inbox.

Any subscription activation that bypasses the online gateway (hand-activation, approved bank transfer, coupon, free plan, scheduled manual payment) must still confirm to the customer, copied to accounts@: a receipt-with-PDFs when money actually changed hands, otherwise a plain activation confirmation — exactly ONE email per activation. Guard the send against repeats: claim the transition atomically (`WHERE status <> 'active' … RETURNING`) or lean on the invoice providerRef dedupe; a read-then-write status check lets two concurrent requests both email.

**How to apply:** central `sendMail` (api-server lib/mail) auto-BCCs when `tenantId === 0`; `platformCopy?: boolean` forces/suppresses it (support tickets pass `platformCopy: true` because they send with a tenant id). BCC is skipped when the recipient already IS the accounts address. Direct ZeptoMail senders (auth verify/reset, admin invite) carry an explicit `bcc` entry — any NEW platform email path must either go through lib/mail with tenantId 0 or add the bcc itself. Zepto bcc shape: `[{ email_address: { address, name } }]` (name required by the typings).
