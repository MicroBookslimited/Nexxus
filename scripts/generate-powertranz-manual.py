from weasyprint import HTML, CSS

html_content = """
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PowerTranz / FAC Integration Manual</title>
</head>
<body>

<div class="cover">
  <div class="cover-top-bar"></div>
  <div class="cover-inner">
    <div class="cover-logo">PT</div>
    <h1 class="cover-title">PowerTranz / FAC</h1>
    <h2 class="cover-subtitle">Payment Integration Manual</h2>
    <p class="cover-desc">Complete developer guide for integrating First Atlantic Commerce card payments via the PowerTranz SPI 3D Secure flow into Node.js / Express + React / Vite applications.</p>
    <div class="cover-meta">
      <span>Version 1.0</span>
      <span class="dot">·</span>
      <span>April 2026</span>
      <span class="dot">·</span>
      <span>MicroBooks Solutions</span>
    </div>
  </div>
  <div class="cover-bottom-bar"></div>
</div>

<div class="toc-page">
  <h2 class="toc-heading">Table of Contents</h2>
  <ul class="toc">
    <li><span class="toc-num">1</span><span class="toc-item">Architecture Overview</span><span class="toc-dots"></span><span class="toc-page-num">2</span></li>
    <li><span class="toc-num">2</span><span class="toc-item">Credentials &amp; Environments</span><span class="toc-dots"></span><span class="toc-page-num">2</span></li>
    <li><span class="toc-num">3</span><span class="toc-item">Step 1 — SPI Sale (Backend)</span><span class="toc-dots"></span><span class="toc-page-num">3</span></li>
    <li><span class="toc-num">4</span><span class="toc-item">Step 2 — 3DS Iframe (Frontend)</span><span class="toc-dots"></span><span class="toc-page-num">4</span></li>
    <li><span class="toc-num">5</span><span class="toc-item">Step 3 — 3DS Callback (Backend)</span><span class="toc-dots"></span><span class="toc-page-num">5</span></li>
    <li><span class="toc-num">6</span><span class="toc-item">Step 4 — Polling Fallback (Frontend)</span><span class="toc-dots"></span><span class="toc-page-num">6</span></li>
    <li><span class="toc-num">7</span><span class="toc-item">callPowerTranz Helper Function</span><span class="toc-dots"></span><span class="toc-page-num">6</span></li>
    <li><span class="toc-num">8</span><span class="toc-item">IsoResponseCode Reference</span><span class="toc-dots"></span><span class="toc-page-num">7</span></li>
    <li><span class="toc-num">9</span><span class="toc-item">Common Gotchas</span><span class="toc-dots"></span><span class="toc-page-num">7</span></li>
    <li><span class="toc-num">10</span><span class="toc-item">Frontend Card Form Requirements</span><span class="toc-dots"></span><span class="toc-page-num">8</span></li>
    <li><span class="toc-num">11</span><span class="toc-item">FAC Website Compliance Requirements</span><span class="toc-dots"></span><span class="toc-page-num">9</span></li>
  </ul>
</div>

<!-- SECTION 1 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">1</span>
    <h2>Architecture Overview</h2>
  </div>
  <p>The PowerTranz SPI integration uses a server-side flow with 3D Secure (3DS) challenge support. The browser never communicates directly with PowerTranz — all API calls are proxied through your backend, and the 3DS challenge runs inside a sandboxed iframe.</p>
  <div class="flow-box">
    <div class="flow-step"><span class="flow-arrow">①</span><div><strong>Browser</strong> submits card details to <code>POST /api/billing/powertranz/initiate</code></div></div>
    <div class="flow-step"><span class="flow-arrow">②</span><div><strong>Backend</strong> calls <code>POST https://gateway.ptranz.com/api/spi/sale</code> with card data</div></div>
    <div class="flow-step"><span class="flow-arrow">③</span><div>Gateway returns <strong>SP4</strong> response with <code>SpiToken</code> and <code>RedirectData</code> HTML</div></div>
    <div class="flow-step"><span class="flow-arrow">④</span><div><strong>Frontend</strong> injects <code>RedirectData</code> into iframe via <code>contentDocument.write()</code></div></div>
    <div class="flow-step"><span class="flow-arrow">⑤</span><div>Conductor auto-submits → 3DS challenge runs inside iframe</div></div>
    <div class="flow-step"><span class="flow-arrow">⑥</span><div>PowerTranz POSTs <code>SpiToken</code> to your <code>MerchantResponseUrl</code></div></div>
    <div class="flow-step"><span class="flow-arrow">⑦</span><div><strong>Backend</strong> calls <code>POST https://gateway.ptranz.com/api/spi/payment</code> with raw SpiToken string</div></div>
    <div class="flow-step"><span class="flow-arrow">⑧</span><div>On <code>Approved=true</code> → activate subscription → send <code>window.top.postMessage</code> back to parent</div></div>
  </div>
</div>

<!-- SECTION 2 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">2</span>
    <h2>Credentials &amp; Environments</h2>
  </div>

  <table>
    <thead>
      <tr><th>Environment</th><th>Base URL</th><th>SP ID (example)</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="badge badge-green">Production</span></td><td><code>https://gateway.ptranz.com</code></td><td><code>77102182</code></td></tr>
      <tr><td><span class="badge badge-yellow">Staging</span></td><td><code>https://staging.ptranz.com</code></td><td><code>88805806</code></td></tr>
    </tbody>
  </table>

  <div class="info-box">
    <strong>Storage Rule:</strong> Store credentials in a DB settings table using the key format <code>0:powertranz_spid</code>, <code>0:powertranz_sppassword</code>, <code>0:powertranz_env</code>, <code>0:powertranz_enabled</code>. Always read them live on each request — never cache them in memory.
  </div>

  <h3>MicroBooks Staging Credentials (FAC-Provided)</h3>
  <table>
    <tbody>
      <tr><td><strong>SP ID</strong></td><td><code>88805806</code></td></tr>
      <tr><td><strong>Password</strong></td><td><code>OIUK1pAzM7aNZqaGb7bhJs0heKaNsnCcagOMlO6aFe2NxzE2A4J1L2</code></td></tr>
      <tr><td><strong>Portal</strong></td><td><code>https://ecm.firstatlanticcommerce.com</code> — <code>microbooks.test@fac.bm</code> / <code>9vFZQIb6</code></td></tr>
      <tr><td><strong>Test Card</strong></td><td><code>4012000000020071</code></td></tr>
    </tbody>
  </table>

  <h3>JNCB Card Verification Account</h3>
  <p>A separate account is required for NCB cardholders.</p>
  <table>
    <tbody>
      <tr><td><strong>SP ID</strong></td><td><code>88801357</code></td></tr>
      <tr><td><strong>Password</strong></td><td><code>6C9ez4QYThmHQZwxMXIgRkb8DkisTZzPoZOtUz8BZhQyC7MGEnfGmz1</code></td></tr>
    </tbody>
  </table>
</div>

<!-- SECTION 3 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">3</span>
    <h2>Step 1 — SPI Sale (Backend)</h2>
  </div>

  <p>Initiate a sale by sending card details and order information to the PowerTranz SPI sale endpoint.</p>

  <h3>Endpoint</h3>
  <div class="endpoint-box">
    <span class="method">POST</span>
    <code>https://gateway.ptranz.com/api/spi/sale</code>
  </div>

  <h3>Request Headers</h3>
  <pre>PowerTranz-PowerTranzId:       {spId}
PowerTranz-PowerTranzPassword: {spPassword}
Content-Type:                  application/json; charset=utf-8
Accept:                        application/json</pre>

  <h3>Request Body</h3>
  <pre>{
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
}</pre>

  <div class="warning-box">
    <strong>⚠ Critical:</strong> <code>MerchantResponseUrl</code> must be a <em>sibling</em> of <code>ThreeDSecure</code> inside <code>ExtendedData</code> — NOT nested inside <code>ThreeDSecure</code>. Wrong placement returns SP4 but the callback URL is never called.
  </div>

  <h3>Card Expiry Conversion</h3>
  <p>Users enter expiry as <code>MM / YY</code> (e.g. <code>12 / 31</code>). Convert to <code>YYMM</code> format for the API:</p>
  <pre>const [mm, yy] = cardExpiry.split("/").map(s => s.trim());
const CardExpiration = `${yy}${mm}`;   // "3112" for December 2031</pre>

  <h3>Currency Codes</h3>
  <table>
    <thead><tr><th>Code</th><th>Currency</th></tr></thead>
    <tbody>
      <tr><td><code>840</code></td><td>USD — United States Dollar</td></tr>
      <tr><td><code>388</code></td><td>JMD — Jamaican Dollar</td></tr>
    </tbody>
  </table>

  <h3>SP4 Response (3DS Initiated)</h3>
  <pre>{
  "IsoResponseCode": "SP4",
  "SpiToken": "abc123xyz...",
  "RedirectData": "&lt;!DOCTYPE html&gt;...&lt;form action='https://gateway.ptranz.com/api/spi/Conductor'&gt;...&lt;/form&gt;"
}</pre>
  <p>Store <code>{ spiToken → tenantId, planId, amount, status: "pending" }</code> in an in-memory map with a 10-minute TTL. Return <code>{ step: "3ds", spiToken, redirectData }</code> to the frontend.</p>
</div>

<!-- SECTION 4 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">4</span>
    <h2>Step 2 — 3DS Iframe (Frontend)</h2>
  </div>

  <p>Render the <code>RedirectData</code> HTML inside a sandboxed iframe so the Conductor can auto-submit the form and begin the 3DS challenge flow.</p>

  <div class="warning-box">
    <strong>⚠ Do NOT use <code>iframe.srcdoc</code></strong> — it creates a <code>null</code> origin context that silently blocks the <code>GetBrowserInfoAndSubmit()</code> JavaScript from executing. The form will never auto-submit.
  </div>

  <h3>Correct Implementation</h3>
  <pre>const iframe = document.createElement("iframe");
iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
iframe.setAttribute("sandbox",
  "allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups"
);
container.appendChild(iframe);

const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
if (doc) {
  doc.open();
  doc.write(redirectData);   // RedirectData from the SP4 response
  doc.close();
}</pre>

  <h3>What Happens Inside the Iframe</h3>
  <ol>
    <li>The <code>RedirectData</code> HTML loads and runs <code>GetBrowserInfoAndSubmit()</code></li>
    <li>This function collects browser fingerprint data and submits the form to the Conductor</li>
    <li>The Conductor handles device fingerprinting, authentication challenge, and redirect</li>
    <li>On completion, PowerTranz POSTs the <code>SpiToken</code> to your <code>MerchantResponseUrl</code></li>
  </ol>

  <div class="info-box">
    <strong>UI Recommendation:</strong> Show the iframe inside a full-screen modal overlay. A minimum height of 480–520px is recommended to display the 3DS challenge form without scrolling. Always include a Cancel button so the user can abort the flow.
  </div>
</div>

<!-- SECTION 5 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">5</span>
    <h2>Step 3 — 3DS Callback (Backend)</h2>
  </div>

  <p>After the cardholder completes the 3DS challenge, PowerTranz POSTs the <code>SpiToken</code> to your <code>MerchantResponseUrl</code> as a form field.</p>

  <h3>Route Handler</h3>
  <pre>router.post("/billing/powertranz/3ds-callback", async (req, res) => {
  const spiToken = req.body?.SpiToken ?? req.body?.spiToken;

  // CRITICAL: body must be the raw SpiToken string, not an object
  const { data } = await callPowerTranz("/api/spi/payment", spiToken);

  if (data.Approved) {
    // Activate subscription, record commissions, etc.
    res.send(closeScript("approved", "Payment approved!", planName, rrn));
  } else {
    res.send(closeScript("declined", data.ResponseMessage ?? "Declined"));
  }
});</pre>

  <div class="warning-box">
    <strong>⚠ /api/spi/payment Body Format — Critical:</strong> The body must be the SpiToken as a <strong>raw JSON string</strong>:
    <br><br>
    <code>"dg05vhgq296s1n83bb7luatzkj7zhjv7twzb79..."</code>
    <br><br>
    Call <code>JSON.stringify(spiToken)</code> where <code>spiToken</code> is already a string — this produces <code>"token_value"</code> (with the surrounding quotes) as the request body. <strong>Do NOT send <code>{ SpiToken: token }</code> as an object</strong> — the gateway silently cannot locate the token and returns a failure.
  </div>

  <h3>Callback HTML Response</h3>
  <p>The callback route must return HTML that communicates the result back to the parent page via <code>window.top.postMessage</code>:</p>
  <pre>const closeScript = (status, message, extra = "") =>
  `&lt;html&gt;&lt;body&gt;&lt;script&gt;
    try {
      window.top.postMessage({
        type: "POWERTRANZ_3DS",
        status: ${JSON.stringify(status)},
        message: ${JSON.stringify(message)}
        ${extra}
      }, "*");
    } catch(e) {}
  &lt;/script&gt;&lt;p&gt;${message}&lt;/p&gt;&lt;/body&gt;&lt;/html&gt;`;</pre>
</div>

<!-- SECTION 6 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">6</span>
    <h2>Step 4 — Polling Fallback (Frontend)</h2>
  </div>

  <p>In rare cases <code>window.top.postMessage</code> may be blocked by the browser's cross-origin policy. Set up a polling loop as a fallback to detect the final transaction status:</p>

  <pre>const poll = setInterval(async () => {
  const s = await fetch(
    `/api/billing/powertranz/3ds-status?spiToken=${token}`
  ).then(r => r.json());

  if (s.status === "approved" || s.status === "declined") {
    clearInterval(poll);
    handleResult(s);
  }
}, 3000);   // poll every 3 seconds</pre>

  <p>The status endpoint reads from your in-memory pending map and returns the current status of the token.</p>
</div>

<!-- SECTION 7 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">7</span>
    <h2>callPowerTranz Helper Function</h2>
  </div>

  <p>A single reusable function handles both the <code>/api/spi/sale</code> (object body) and <code>/api/spi/payment</code> (string body) calls:</p>

  <pre>async function callPowerTranz(endpoint: string, body: object | string) {
  const { spId, spPassword, base } = await getPowerTranzConfig();

  const resp = await fetch(`${base}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type":                  "application/json; charset=utf-8",
      "Accept":                        "application/json",
      "PowerTranz-PowerTranzId":       spId,
      "PowerTranz-PowerTranzPassword": spPassword,
    },
    body: JSON.stringify(body),  // works correctly for both types
  });

  const raw = await resp.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  return { raw, status: resp.status, data };
}</pre>

  <div class="info-box">
    <strong>Why this works for both calls:</strong><br>
    <code>JSON.stringify({ key: "val" })</code> → <code>{"key":"val"}</code> (object body for /sale)<br>
    <code>JSON.stringify("token_string")</code> → <code>"token_string"</code> (raw string body for /payment)
  </div>
</div>

<!-- SECTION 8 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">8</span>
    <h2>IsoResponseCode Reference</h2>
  </div>

  <table>
    <thead>
      <tr><th>Code</th><th>Meaning</th><th>Action</th></tr>
    </thead>
    <tbody>
      <tr><td><code>SP4</code></td><td>3DS preprocessing complete</td><td>Use SpiToken + RedirectData to render iframe</td></tr>
      <tr><td><code>00</code></td><td>Approved</td><td>Activate subscription / fulfil order</td></tr>
      <tr><td><code>05</code></td><td>Declined — contact bank</td><td>Show decline message, ask user to try another card</td></tr>
      <tr><td><code>14</code></td><td>Invalid card number</td><td>Prompt user to check card number</td></tr>
      <tr><td><code>51</code></td><td>Insufficient funds</td><td>Prompt user to try another card</td></tr>
      <tr><td><code>54</code></td><td>Expired card</td><td>Prompt user to check expiry date</td></tr>
      <tr><td><code>82</code></td><td>Invalid CVV</td><td>Prompt user to check CVV</td></tr>
      <tr><td><code>91</code></td><td>Issuer unavailable</td><td>Retry later or try another card</td></tr>
    </tbody>
  </table>
</div>

<!-- SECTION 9 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">9</span>
    <h2>Common Gotchas</h2>
  </div>

  <p>These are hard-won lessons from a real production integration. Each of these caused silent failures that were difficult to diagnose.</p>

  <div class="gotcha">
    <div class="gotcha-num">1</div>
    <div class="gotcha-body">
      <strong>MerchantResponseUrl placement</strong>
      <p>Must be a sibling of <code>ThreeDSecure</code> inside <code>ExtendedData</code>, NOT nested inside <code>ThreeDSecure</code>. Wrong placement: the gateway returns SP4 successfully, but your callback URL is never called — the payment hangs indefinitely.</p>
      <pre>// ✅ Correct
"ExtendedData": {
  "ThreeDSecure": { "ChallengeWindowSize": "05" },
  "MerchantResponseUrl": "https://..."    // ← sibling
}

// ❌ Wrong
"ExtendedData": {
  "ThreeDSecure": {
    "ChallengeWindowSize": "05",
    "MerchantResponseUrl": "https://..."  // ← nested = silent fail
  }
}</pre>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">2</div>
    <div class="gotcha-body">
      <strong>/api/spi/payment body must be a raw JSON string</strong>
      <p>The body is the SpiToken quoted as a JSON string — not wrapped in an object. Sending <code>{ SpiToken: "..." }</code> silently fails; the gateway returns a generic error because it cannot locate the token.</p>
      <pre>// ✅ Correct — body is: "dg05vhgq296s..."
body: JSON.stringify(spiToken)  // spiToken is a string

// ❌ Wrong — body is: {"SpiToken":"dg05vhgq296s..."}
body: JSON.stringify({ SpiToken: spiToken })</pre>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">3</div>
    <div class="gotcha-body">
      <strong>iframe srcdoc blocks JavaScript execution</strong>
      <p>Setting <code>iframe.srcdoc = redirectData</code> creates a <code>null</code> origin context. The <code>GetBrowserInfoAndSubmit()</code> function silently does nothing — the form never submits. Always use <code>contentDocument.write()</code> instead.</p>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">4</div>
    <div class="gotcha-body">
      <strong>CardExpiration format is YYMM not MMYY</strong>
      <p>December 2031 → <code>"3112"</code> (not <code>"1231"</code>). Using MMYY will result in an invalid card error (<code>IsoResponseCode: "54"</code> — Expired card).</p>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">5</div>
    <div class="gotcha-body">
      <strong>Staging vs. production credential mismatch</strong>
      <p>Staging and production have completely different SP IDs and passwords. If a transaction declines but shows no trace in the FAC merchant portal, you are almost certainly hitting the wrong environment. Check your DB settings table for <code>0:powertranz_env</code>, <code>0:powertranz_spid</code>.</p>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">6</div>
    <div class="gotcha-body">
      <strong>PCI logging — mask card data before logging</strong>
      <p>Never log raw card details. Always mask before writing to logs or console:</p>
      <pre>CardPan: "****" + cardPan.slice(-4),   // e.g. "****1111"
CardCvv: "***",
CardholderName: cardholderName         // name is safe to log</pre>
    </div>
  </div>

  <div class="gotcha">
    <div class="gotcha-num">7</div>
    <div class="gotcha-body">
      <strong>In-memory pending store is lost on restart</strong>
      <p>The <code>Map&lt;spiToken, pendingData&gt;</code> with TTL works for development but is wiped on every server restart. For production resilience, persist pending transactions to a <code>pending_transactions</code> database table.</p>
    </div>
  </div>
</div>

<!-- SECTION 10 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">10</span>
    <h2>Frontend Card Form Requirements</h2>
  </div>

  <p>FAC requires the following fields on the payment form:</p>

  <table>
    <thead><tr><th>Field</th><th>Input Type</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>Cardholder Name</td><td>Text</td><td>As it appears on the card</td></tr>
      <tr><td>Card Number</td><td>Text</td><td>Format as <code>4111 1111 1111 1111</code> (spaces every 4 digits)</td></tr>
      <tr><td>Expiry Date</td><td>Text</td><td>Display as <code>MM / YY</code>; convert to <code>YYMM</code> for API</td></tr>
      <tr><td>CVV</td><td>Password</td><td>3 digits (Visa/MC) or 4 digits (Amex)</td></tr>
    </tbody>
  </table>

  <h3>Required Branding Elements on Payment Page</h3>
  <ul>
    <li>Visa logo</li>
    <li>Mastercard logo</li>
    <li>Verified by Visa logo</li>
    <li>Mastercard SecureCode® logo</li>
    <li>"Powered by FAC" logo (mandatory)</li>
  </ul>
</div>

<!-- SECTION 11 -->
<div class="section">
  <div class="section-header">
    <span class="section-num">11</span>
    <h2>FAC Website Compliance Requirements</h2>
  </div>

  <p>FAC's website requirements document mandates the following be clearly visible on the merchant's website before approval:</p>

  <div class="compliance-grid">
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Payment Brand Logos</strong>
        <p>Visa, Mastercard, Verified by Visa, Mastercard SecureCode®, and "Powered by FAC" logos must all appear on the checkout / payment page.</p>
      </div>
    </div>
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Refund / Return / Cancellation Policy</strong>
        <p>A clearly written policy explaining under what conditions refunds or cancellations are granted. Must be accessible from the payment page.</p>
      </div>
    </div>
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Customer Service Contact</strong>
        <p>A working phone number or email address for customer support must be published on the website.</p>
      </div>
    </div>
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Transaction Currency</strong>
        <p>The currency of every transaction must be stated clearly (e.g. "All prices in USD" or "All prices in JMD").</p>
      </div>
    </div>
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Terms &amp; Conditions</strong>
        <p>Full Terms &amp; Conditions including acceptable use, payment terms, and data handling must be published and linked from the payment page.</p>
      </div>
    </div>
    <div class="compliance-item">
      <div class="compliance-icon">✓</div>
      <div>
        <strong>Privacy Policy</strong>
        <p>A privacy policy explaining how cardholder data is handled and stored (or confirming it is never stored) is strongly recommended and may be required.</p>
      </div>
    </div>
  </div>
</div>

<div class="footer-bar">
  PowerTranz / FAC Integration Manual · Version 1.0 · April 2026 · MicroBooks Solutions
</div>

</body>
</html>
"""

css_content = """
@page {
  size: A4;
  margin: 0;
}

@page :first {
  margin: 0;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  color: #1e293b;
  line-height: 1.6;
  background: #fff;
}

/* ── COVER PAGE ── */
.cover {
  page-break-after: always;
  height: 297mm;
  background: #0f1729;
  display: flex;
  flex-direction: column;
  position: relative;
}

.cover-top-bar {
  height: 8px;
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

.cover-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 80px;
  text-align: center;
}

.cover-logo {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: #3b82f6;
  color: white;
  font-size: 28pt;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  letter-spacing: -1px;
}

.cover-title {
  font-size: 36pt;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
}

.cover-subtitle {
  font-size: 18pt;
  font-weight: 400;
  color: #60a5fa;
  margin-bottom: 32px;
}

.cover-desc {
  font-size: 11pt;
  color: #94a3b8;
  max-width: 480px;
  line-height: 1.7;
  margin-bottom: 48px;
}

.cover-meta {
  font-size: 9pt;
  color: #64748b;
  display: flex;
  gap: 12px;
  align-items: center;
}

.cover-meta .dot {
  color: #3b82f6;
}

.cover-bottom-bar {
  height: 8px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6);
}

/* ── TOC PAGE ── */
.toc-page {
  page-break-after: always;
  padding: 60px 60px;
  min-height: 297mm;
}

.toc-heading {
  font-size: 22pt;
  font-weight: 700;
  color: #0f1729;
  margin-bottom: 40px;
  padding-bottom: 16px;
  border-bottom: 3px solid #3b82f6;
}

.toc {
  list-style: none;
}

.toc li {
  display: flex;
  align-items: baseline;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  gap: 12px;
}

.toc-num {
  font-size: 9pt;
  font-weight: 700;
  color: #3b82f6;
  background: #eff6ff;
  border-radius: 4px;
  padding: 2px 7px;
  min-width: 28px;
  text-align: center;
}

.toc-item {
  flex: 1;
  font-size: 11pt;
  font-weight: 500;
  color: #334155;
}

.toc-dots {
  flex: 1;
  border-bottom: 1px dotted #cbd5e1;
  margin: 0 8px 4px 8px;
}

.toc-page-num {
  font-size: 10pt;
  font-weight: 600;
  color: #64748b;
  min-width: 20px;
  text-align: right;
}

/* ── SECTION PAGES ── */
.section {
  padding: 48px 60px;
  page-break-after: always;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #e2e8f0;
}

.section-num {
  width: 36px;
  height: 36px;
  background: #3b82f6;
  color: white;
  border-radius: 8px;
  font-size: 14pt;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section h2 {
  font-size: 18pt;
  font-weight: 700;
  color: #0f1729;
}

.section h3 {
  font-size: 11.5pt;
  font-weight: 700;
  color: #1e293b;
  margin: 20px 0 10px;
}

.section p {
  margin-bottom: 12px;
  color: #334155;
}

.section ul, .section ol {
  margin: 12px 0 12px 20px;
  color: #334155;
}

.section li {
  margin-bottom: 6px;
}

/* ── CODE BLOCKS ── */
pre {
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 16px 20px;
  font-family: "Courier New", monospace;
  font-size: 8.5pt;
  line-height: 1.6;
  margin: 12px 0;
  white-space: pre-wrap;
  word-break: break-all;
  border-left: 3px solid #3b82f6;
}

code {
  font-family: "Courier New", monospace;
  font-size: 8.5pt;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 3px;
  padding: 1px 5px;
}

pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  font-size: inherit;
}

/* ── TABLES ── */
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 9.5pt;
}

thead tr {
  background: #0f1729;
  color: #fff;
}

thead th {
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 9pt;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

tbody tr:nth-child(even) {
  background: #f8fafc;
}

tbody td {
  padding: 9px 14px;
  border-bottom: 1px solid #e2e8f0;
  color: #334155;
}

/* ── BOXES ── */
.warning-box {
  background: #fff7ed;
  border-left: 4px solid #f97316;
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin: 14px 0;
  font-size: 9.5pt;
  color: #7c2d12;
}

.info-box {
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
  border-radius: 0 8px 8px 0;
  padding: 14px 18px;
  margin: 14px 0;
  font-size: 9.5pt;
  color: #1e3a5f;
}

/* ── FLOW BOX ── */
.flow-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px 24px;
  margin: 16px 0;
}

.flow-step {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  margin-bottom: 12px;
  font-size: 9.5pt;
  color: #334155;
}

.flow-step:last-child {
  margin-bottom: 0;
}

.flow-arrow {
  font-size: 13pt;
  font-weight: 700;
  color: #3b82f6;
  min-width: 28px;
  margin-top: -1px;
}

/* ── ENDPOINT BOX ── */
.endpoint-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #0f172a;
  border-radius: 8px;
  padding: 12px 18px;
  margin: 12px 0;
}

.method {
  background: #3b82f6;
  color: white;
  font-size: 8pt;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.endpoint-box code {
  background: transparent;
  color: #60a5fa;
  font-size: 9.5pt;
  padding: 0;
}

/* ── BADGES ── */
.badge {
  font-size: 8pt;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 20px;
}

.badge-green {
  background: #dcfce7;
  color: #166534;
}

.badge-yellow {
  background: #fefce8;
  color: #854d0e;
}

/* ── GOTCHAS ── */
.gotcha {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
}

.gotcha-num {
  width: 32px;
  height: 32px;
  background: #f97316;
  color: white;
  border-radius: 50%;
  font-weight: 700;
  font-size: 13pt;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}

.gotcha-body strong {
  font-size: 10.5pt;
  color: #0f1729;
}

.gotcha-body p {
  font-size: 9.5pt;
  color: #475569;
  margin-top: 4px;
}

.gotcha-body pre {
  font-size: 8pt;
  margin-top: 8px;
}

/* ── COMPLIANCE GRID ── */
.compliance-grid {
  display: block;
}

.compliance-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #f8fafc;
}

.compliance-icon {
  width: 28px;
  height: 28px;
  background: #22c55e;
  color: white;
  border-radius: 50%;
  font-size: 13pt;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.compliance-item strong {
  font-size: 10pt;
  color: #0f1729;
}

.compliance-item p {
  font-size: 9pt;
  color: #475569;
  margin-top: 3px;
  margin-bottom: 0;
}

/* ── FOOTER BAR ── */
.footer-bar {
  background: #0f1729;
  color: #64748b;
  font-size: 8.5pt;
  text-align: center;
  padding: 14px;
}
"""

HTML(
    string=html_content,
    base_url="."
).write_pdf(
    "exports/PowerTranz-FAC-Integration-Manual.pdf",
    stylesheets=[CSS(string=css_content)]
)

print("PDF generated successfully.")
