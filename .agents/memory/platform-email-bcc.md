---
name: Platform email BCC
description: Which emails get BCC'd to the accounts inbox and how the gating works
---
Rule: platform-level emails (subscription/billing, auth, support, expiry reminders, superadmin sends) are BCC'd to accounts@microbookssolutions.com. Tenant→customer emails (receipts, loyalty/marketing, tenant daily digest / low-stock reports, Resend marketing campaigns) are NEVER copied.

**Why:** user explicitly scoped the copy to platform emails only; copying tenant reports/marketing would leak tenant business data and flood the inbox.

**How to apply:** central `sendMail` (api-server lib/mail) auto-BCCs when `tenantId === 0`; `platformCopy?: boolean` forces/suppresses it (support tickets pass `platformCopy: true` because they send with a tenant id). BCC is skipped when the recipient already IS the accounts address. Direct ZeptoMail senders (auth verify/reset, admin invite) carry an explicit `bcc` entry — any NEW platform email path must either go through lib/mail with tenantId 0 or add the bcc itself. Zepto bcc shape: `[{ email_address: { address, name } }]` (name required by the typings).
