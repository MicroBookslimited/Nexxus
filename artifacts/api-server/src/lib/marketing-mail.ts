/**
 * Marketing mailer — uses Resend (separate provider from the transactional
 * ZeptoMail/SMTP path in `mail.ts`). This isolates promotional volume from
 * critical transactional deliverability.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export function isMarketingMailerConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

function buildUnsubscribeFooter(unsubscribeUrl: string): string {
  return `
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-family:sans-serif;font-size:12px;color:#6b7280;text-align:center;">
  <p style="margin:0 0 6px;">You are receiving this email because you have an account with NEXXUS POS.</p>
  <p style="margin:0;">
    If you no longer wish to receive marketing emails from us,
    <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">click here to unsubscribe</a>.
  </p>
</div>`;
}

export async function sendMarketingMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromAddress: string;
  replyTo?: string;
  unsubscribeUrl?: string;
}): Promise<{ messageId?: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured. Add it to environment secrets.");
  }

  const from = `${opts.fromName} <${opts.fromAddress}>`;

  const htmlWithFooter = opts.unsubscribeUrl
    ? opts.html + buildUnsubscribeFooter(opts.unsubscribeUrl)
    : opts.html;

  const payload = JSON.stringify({
    from,
    to: [opts.to],
    subject: opts.subject,
    html: htmlWithFooter,
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    ...(opts.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${opts.unsubscribeUrl}>` } } : {}),
  });

  // Retry once on transient errors (429 / 5xx) honoring Retry-After.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    });

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };

    if (res.ok) return { messageId: data.id };

    const transient = res.status === 429 || res.status >= 500;
    if (transient && attempt === 0) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "1", 10);
      await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
      continue;
    }

    const msg = data.message ?? data.name ?? `Resend HTTP ${res.status}`;
    throw new Error(`Resend error: ${msg}`);
  }

  throw new Error("Resend error: retry exhausted");
}
