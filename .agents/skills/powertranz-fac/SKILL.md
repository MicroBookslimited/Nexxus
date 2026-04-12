---
name: powertranz-fac
description: Integrate PowerTranz (First Atlantic Commerce / FAC) card payment processing into a Node.js/Express + React/Vite app. Covers the full SPI 3DS flow, correct body formats, iframe rendering, callback handling, and all known gotchas. Use when adding card payment via PowerTranz/FAC gateway.
---

# PowerTranz / FAC Payment Integration

PowerTranz is the payment gateway used by First Atlantic Commerce (FAC) in the Caribbean. This skill covers the full SPI (Server Payment Interface) 3D Secure flow for subscription or one-time payments.

## Architecture Overview

```
Browser → POST /api/billing/powertranz/initiate (with card details)
  → Backend calls https://gateway.ptranz.com/api/spi/sale
  → Gets SP4 response + SpiToken + RedirectData HTML
  → Frontend injects HTML into iframe (Conductor auto-submits)
  → Conductor redirects inside iframe through 3DS challenge
  → PowerTranz POSTs to MerchantResponseUrl (our backend)
  → Backend calls https://gateway.ptranz.com/api/spi/payment (with raw SpiToken string)
  → Gets Approved=true → activate subscription
  → Sends HTML with window.top.postMessage back to parent
```

---

## Credentials & Environments

| Environment | Base URL | SP ID example |
|---|---|---|
| Production | `https://gateway.ptranz.com` | `77102182` |
| Staging | `https://staging.ptranz.com` | `88805806` |

Store credentials in a DB settings table (key `0:powertranz_spid`, `0:powertranz_sppassword`, `0:powertranz_env`, `0:powertranz_enabled`). Read them live on each request — no caching.

**Staging credentials** (FAC-provided for MicroBooks):
- SP ID: `88805806`
- Password: `OIUK1pAzM7aNZqaGb7bhJs0heKaNsnCcagOMlO6aFe2NxzE2A4J1L2`
- Staging merchant portal: `https://ecm.firstatlanticcommerce.com` → `microbooks.test@fac.bm` / `9vFZQIb6`
- Staging test card: `4012000000020071`

**JNCB Card Verification Account** (separate, required for NCB cardholders):
- SP ID: `88801357`
- Password: `6C9ez4QYThmHQZwxMXIgRkb8DkisTZzPoZOtUz8BZhQyC7MGEnfGmz1`

---

## Step 1 — SPI Sale (backend)

`POST https://gateway.ptranz.com/api/spi/sale`

### Request Headers
```
PowerTranz-PowerTranzId: {spId}
PowerTranz-PowerTranzPassword: {spPassword}
Content-Type: application/json; charset=utf-8
Accept: application/json
```

### Request Body
```json
{
  "TransactionIdentifier": "{uuid}",
  "TotalAmount": 99.00,
  "CurrencyCode": "840",
  "ThreeDSecure": true,
  "Source": {
    "CardPan": "4012000000020071",
    "CardCvv": "123",
    "CardExpiration": "2510",
    "CardholderName": "John Doe"
  },
  "OrderIdentifier": "ORDER-{tenantId}-{timestamp}",
  "ExtendedData": {
    "ThreeDSecure": {
      "ChallengeWindowSize": "05",
      "ChallengeIndicator": "01"
    },
    "MerchantResponseUrl": "https://yourdomain.com/api/billing/powertranz/3ds-callback"
  }
}
```

**Critical: `MerchantResponseUrl` is a sibling of `ThreeDSecure` inside `ExtendedData` — NOT nested inside `ThreeDSecure`.**

### Card Expiry Format
User enters `MM / YY` (e.g. `12 / 31`). Convert to `YYMM` format for the API:
```ts
const [mm, yy] = cardExpiry.split("/").map(s => s.trim());
const CardExpiration = `${yy}${mm}`; // "3112"
```

### Currency Codes
- `840` = USD
- `388` = JMD

### SP4 Response (3DS initiated)
```json
{
  "IsoResponseCode": "SP4",
  "SpiToken": "abc123xyz...",
  "RedirectData": "<!DOCTYPE html>...<form action='https://gateway.ptranz.com/api/spi/Conductor'>...</form>..."
}
```
Store `{ spiToken → tenantId, planId, amount, status: "pending" }` in memory with a 10-minute TTL. Return `{ step: "3ds", spiToken, redirectData }` to the frontend.

---

## Step 2 — Iframe (frontend)

**DO NOT use `iframe.srcdoc`** — it creates a `null` origin context that silently blocks the auto-submit JavaScript.

Use `contentDocument.write()` instead:
```tsx
const iframe = document.createElement("iframe");
iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups");
container.appendChild(iframe);

const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
if (doc) {
  doc.open();
  doc.write(redirectData);  // The HTML from RedirectData field
  doc.close();
}
```

The HTML auto-runs `GetBrowserInfoAndSubmit()` which collects browser info and submits the form to the Conductor. The Conductor then handles 3DS inside the iframe.

Show this in a modal overlay (480–520px tall) with a cancel button.

---

## Step 3 — 3DS Callback (backend)

PowerTranz POSTs to your `MerchantResponseUrl` with the `SpiToken` in the form body after the cardholder completes 3DS.

```ts
router.post("/billing/powertranz/3ds-callback", async (req, res) => {
  const spiToken = req.body?.SpiToken ?? req.body?.spiToken;

  // CRITICAL: payment body is a raw JSON string, NOT an object
  const { data } = await callPowerTranz("/api/spi/payment", spiToken);
  // bodyStr = JSON.stringify(spiToken) → sends "token_value" (with quotes) as body

  if (data.Approved) {
    // activate subscription, record commissions
    res.send(closeScript("approved", "Payment approved!", planName, rrn));
  } else {
    res.send(closeScript("declined", data.ResponseMessage ?? "Declined"));
  }
});
```

### /api/spi/payment Body Format — CRITICAL
The Postman collection confirms the body must be the SpiToken as a **raw JSON string**:
```
"dg05vhgq296s1n83bb7luatzkj7zhjv7twzb79..."
```
Call `JSON.stringify(spiToken)` where `spiToken` is a string — this produces `"token_value"` (with surrounding quotes) which is the correct format. **Do NOT send `{ SpiToken: token }` as an object.**

### Callback HTML Response (communicates back to parent)
```ts
const closeScript = (status: string, message: string, extra = "") =>
  `<html><body><script>try{window.top.postMessage({type:"POWERTRANZ_3DS",status:${JSON.stringify(status)},message:${JSON.stringify(message)}${extra}},"*");}catch(e){}</script><p>${message}</p></body></html>`;
```
The `window.top.postMessage` fires from the iframe to your parent page.

---

## Step 4 — Polling Fallback (frontend)

In case `postMessage` is blocked across origins, also poll a status endpoint:
```ts
const poll = setInterval(async () => {
  const s = await fetch(`/api/billing/powertranz/3ds-status?spiToken=${token}`).then(r => r.json());
  if (s.status === "approved" || s.status === "declined") {
    clearInterval(poll);
    handleResult(s);
  }
}, 3000);
```

---

## callPowerTranz Helper
```ts
async function callPowerTranz(endpoint: string, body: object | string) {
  const { spId, spPassword, base } = await getPowerTranzConfig();
  const resp = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Accept": "application/json",
      "PowerTranz-PowerTranzId": spId,
      "PowerTranz-PowerTranzPassword": spPassword,
    },
    body: JSON.stringify(body),  // works for both object and string
  });
  const raw = await resp.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  return { raw, status: resp.status, data };
}
```

**`JSON.stringify(obj)` → `{"key":"val"}` for objects; `JSON.stringify("str")` → `"str"` for strings.** Both formats are correct for their respective endpoints.

---

## IsoResponseCode Reference

| Code | Meaning |
|---|---|
| `SP4` | SPI preprocessing complete — 3DS initiated, use SpiToken + RedirectData |
| `00` | Approved |
| `05` | Declined — contact bank |
| `14` | Invalid card number |
| `51` | Insufficient funds |
| `54` | Expired card |
| `82` | Invalid CVV |
| `91` | Issuer unavailable |

---

## Common Gotchas (hard-won)

1. **`MerchantResponseUrl` placement** — must be in `ExtendedData` as a sibling of the `ThreeDSecure` object, NOT nested inside it. Wrong placement returns SP4 but callback never fires.

2. **`/api/spi/payment` body** — must be a raw JSON string `"token"`, not `{ "SpiToken": "token" }`. Object format silently fails (gateway can't find the token).

3. **iframe `srcdoc` blocks JS** — the `GetBrowserInfoAndSubmit()` script won't execute in a `null`-origin context. Use `contentDocument.write()` instead.

4. **CardExpiration format** — is `YYMM` (not `MMYY`). December 2031 = `"3112"`.

5. **Wrong credentials** — staging and production have completely different SP IDs. Check the DB settings if you see declines with no FAC dashboard trace.

6. **PCI logging** — always mask card details in logs: `CardPan: "****1111"`, `CardCvv: "***"` before logging the request body.

7. **In-memory pending store** — use a `Map<spiToken, pendingData>` with a 10-min TTL `setTimeout`. This is lost on server restart. For production resilience, persist to a `pending_transactions` DB table.

---

## Frontend Card Form Requirements (per FAC)

- Cardholder Name
- Card Number (mask/format as `4111 1111 1111 1111`)
- Expiry (`MM / YY` display, convert to `YYMM` for API)
- CVV (password input, 3–4 digits)
- "Powered by FAC" logo required on payment page
- Visa / Mastercard / 3DS logos required

## Website Requirements (FAC mandate)
Per FAC's website requirements document, the payment page must show:
- Visa, Mastercard, Verified by Visa, Mastercard SecureCode® logos
- Clear refund/return/cancellation policy
- Customer service contact
- "Powered by FAC" logo
- Transaction currency stated clearly
- Terms & Conditions
