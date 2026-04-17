/**
 * Marketing mailer — uses Resend (separate provider from the transactional
 * ZeptoMail/SMTP path in `mail.ts`). This isolates promotional volume from
 * critical transactional deliverability.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export function isMarketingMailerConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

export async function sendMarketingMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromAddress: string;
  replyTo?: string;
}): Promise<{ messageId?: string }> {
  const apiKey = process.env["RESEND_API_KEY"];
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured. Add it to environment secrets.");
  }

  const from = `${opts.fromName} <${opts.fromAddress}>`;

  const payload = JSON.stringify({
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
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
