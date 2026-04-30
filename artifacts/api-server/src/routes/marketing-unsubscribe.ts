import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { db, marketingUnsubscribesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function getJwtSecret() {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

const SUCCESS_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Unsubscribed — NEXXUS POS</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px 40px;max-width:440px;width:100%;text-align:center}
    .icon{width:56px;height:56px;background:#d1fae5;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    .icon svg{width:28px;height:28px;color:#059669}
    h1{font-size:22px;font-weight:700;color:#111827;margin-bottom:12px}
    p{font-size:15px;color:#6b7280;line-height:1.6}
    .footer{margin-top:32px;font-size:13px;color:#9ca3af}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
      </svg>
    </div>
    <h1>You've been unsubscribed</h1>
    <p>You will no longer receive marketing emails from NEXXUS POS. Transactional emails (receipts, account notices) are not affected.</p>
    <div class="footer">NEXXUS POS &mdash; Account &amp; Billing Communications</div>
  </div>
</body>
</html>`;

const ALREADY_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Already Unsubscribed — NEXXUS POS</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px 40px;max-width:440px;width:100%;text-align:center}
    .icon{width:56px;height:56px;background:#e0e7ff;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    .icon svg{width:28px;height:28px;color:#4f46e5}
    h1{font-size:22px;font-weight:700;color:#111827;margin-bottom:12px}
    p{font-size:15px;color:#6b7280;line-height:1.6}
    .footer{margin-top:32px;font-size:13px;color:#9ca3af}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"/>
      </svg>
    </div>
    <h1>Already unsubscribed</h1>
    <p>Your email address is already opted out of marketing emails from NEXXUS POS.</p>
    <div class="footer">NEXXUS POS &mdash; Account &amp; Billing Communications</div>
  </div>
</body>
</html>`;

const ERROR_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invalid Link — NEXXUS POS</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:48px 40px;max-width:440px;width:100%;text-align:center}
    .icon{width:56px;height:56px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
    .icon svg{width:28px;height:28px;color:#dc2626}
    h1{font-size:22px;font-weight:700;color:#111827;margin-bottom:12px}
    p{font-size:15px;color:#6b7280;line-height:1.6}
    .footer{margin-top:32px;font-size:13px;color:#9ca3af}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/>
      </svg>
    </div>
    <h1>Invalid or expired link</h1>
    <p>This unsubscribe link is invalid or has expired. If you want to unsubscribe, please click the link in the original email.</p>
    <div class="footer">NEXXUS POS &mdash; Account &amp; Billing Communications</div>
  </div>
</body>
</html>`;

router.get("/unsubscribe", async (req, res): Promise<void> => {
  const token = String(req.query["token"] ?? "");

  if (!token) {
    res.status(400).type("html").send(ERROR_PAGE);
    return;
  }

  let email: string;
  let campaignId: number | null = null;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { type: string; email: string; campaignId?: number };
    if (payload.type !== "unsubscribe" || !payload.email) {
      throw new Error("Invalid token type");
    }
    email = payload.email;
    if (typeof payload.campaignId === "number" && Number.isFinite(payload.campaignId)) {
      campaignId = payload.campaignId;
    }
  } catch {
    res.status(400).type("html").send(ERROR_PAGE);
    return;
  }

  try {
    const existing = await db
      .select({ id: marketingUnsubscribesTable.id })
      .from(marketingUnsubscribesTable)
      .where(eq(marketingUnsubscribesTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.type("html").send(ALREADY_PAGE);
      return;
    }

    await db.insert(marketingUnsubscribesTable).values({
      email: email.toLowerCase(),
      token,
      campaignId,
      unsubscribedAt: new Date(),
    });

    res.type("html").send(SUCCESS_PAGE);
  } catch {
    res.status(500).type("html").send(ERROR_PAGE);
  }
});

export default router;
