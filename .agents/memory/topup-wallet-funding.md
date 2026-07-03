---
name: Top-up wallet funding currency & payment reuse
description: How real online funding of the DingConnect top-up wallet works (currency model, gateway reuse, server-authoritative crediting)
---

The top-up wallet (Ding/DingConnect resale) is denominated in **JMD**, but both
payment gateways charge in **USD** (currency "840" for PowerTranz, currency_code
"USD" for PayPal) — matching the proven subscription billing config. Do NOT try to
charge FAC/PowerTranz in JMD (388): the merchant account's supported currency is
uncertain and USD is the only proven-working path.

**Conversion:** tenant enters the JMD credit they want; we convert to a USD charge
via a superadmin-configurable setting `topup_jmd_per_usd` (default 158). The dialog
shows the tenant the USD they'll be charged before paying.

**Server-authoritative crediting (never trust the client amount):**
- PayPal: credit wallet from the ACTUAL captured USD × rate (read from the capture
  response `purchase_units[0].payments.captures[0].amount.value`), not the client-sent amount.
- PowerTranz: server computes both the USD charge and the JMD credit from the same
  requested `jmdAmount`, so inflating credit necessarily inflates the charge (no exploit).

**3DS reuse:** wallet funding reuses the existing shared subscription 3DS
infrastructure (`/billing/powertranz/3ds-callback`, `/3ds-status`, iframe + poll).
The `pending3DS` map entry carries `kind: "subscription" | "wallet"`; the callback
branches on `kind` (skips the product-limit recheck for wallet, credits the wallet
instead of activating a subscription). Any new pending3DS entry MUST set `kind`.

**Why:** funding is money movement; a wrong currency assumption or trusting a
client-sent credit amount would let a tenant fund their wallet for free or mischarge.

**How to apply:** if adding another wallet-funding path, follow the same pattern —
charge USD, convert via `topup_jmd_per_usd`, credit from the real captured amount,
and tag pending3DS entries with the correct `kind`.
