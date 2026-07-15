import { SendMailClient } from "zeptomail";
import nodemailer from "nodemailer";
import { getSetting, getAllSettings } from "../routes/settings";

const ZEPTOMAIL_API_URL = "api.zeptomail.com/";

/**
 * Every platform-level email (subscriptions, billing, auth, support,
 * reminders — anything sent with tenantId 0) is BCC'd here so the accounts
 * team keeps a copy. Tenant-originated emails (receipts, loyalty/marketing to
 * a tenant's own customers) are NOT copied.
 */
export const PLATFORM_COPY_ADDRESS = "accounts@microbookssolutions.com";

export async function getFromDetails(tenantId = 0): Promise<{ fromAddress: string; fromName: string }> {
  const [fromAddress, fromName] = await Promise.all([
    getSetting("from_email", tenantId),
    getSetting("from_name", tenantId),
  ]);
  return {
    fromAddress: fromAddress || "noreply@microbookspos.com",
    fromName: fromName || "NEXXUS POS",
  };
}

async function getSmtpConfig(tenantId = 0) {
  const s = await getAllSettings(tenantId);
  return {
    host: s["smtp_host"] ?? "",
    port: parseInt(s["smtp_port"] ?? "587", 10),
    secure: s["smtp_secure"] === "true",
    user: s["smtp_user"] ?? "",
    pass: s["smtp_pass"] ?? "",
    from: s["smtp_from"] ?? "",
    fromName: s["smtp_from_name"] ?? "",
  };
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/** A file attachment. `content` is the raw file bytes (base64-encoded when sent). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  mimeType: string;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromAddress: string;
  tenantId?: number;
  attachments?: MailAttachment[];
  /** Force (true) or suppress (false) the accounts@ BCC. Default: platform emails (tenantId 0) are copied. */
  platformCopy?: boolean;
}): Promise<{ messageId?: string }> {
  const tenantId = opts.tenantId ?? 0;
  const provider = await getSetting("email_provider", tenantId);
  const attachments = opts.attachments ?? [];
  const bccAddress =
    (opts.platformCopy ?? tenantId === 0) &&
    opts.to.trim().toLowerCase() !== PLATFORM_COPY_ADDRESS
      ? PLATFORM_COPY_ADDRESS
      : undefined;

  if (provider === "smtp") {
    const smtp = await getSmtpConfig(tenantId);
    if (!smtp.host) throw new Error("SMTP host is not configured");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    const from = smtp.from
      ? `${smtp.fromName || opts.fromName} <${smtp.from}>`
      : `${opts.fromName} <${opts.fromAddress}>`;
    const info = await transport.sendMail({
      from, to: opts.to, bcc: bccAddress, subject: opts.subject, html: opts.html,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.mimeType })),
    });
    return { messageId: info.messageId };
  }

  const token = process.env["ZEPTOMAIL_TOKEN"];
  if (!token) throw new Error("ZEPTOMAIL_TOKEN is not configured. Please add it to your environment secrets.");

  const zepto = new SendMailClient({ url: ZEPTOMAIL_API_URL, token });
  try {
    const response = await zepto.sendMail({
      from: { address: opts.fromAddress, name: opts.fromName },
      to: [{ email_address: { address: opts.to, name: "" } }],
      ...(bccAddress && { bcc: [{ email_address: { address: bccAddress, name: "" } }] }),
      subject: opts.subject,
      htmlbody: opts.html,
      ...(attachments.length > 0 && {
        attachments: attachments.map((a) => ({
          content: a.content.toString("base64"),
          mime_type: a.mimeType,
          name: a.filename,
        })),
      }),
    });
    return { messageId: (response as { data?: { message_id?: string } })?.data?.message_id };
  } catch (err) {
    const serialized = serializeError(err);
    console.error("[ZeptoMail] Send failed", { to: opts.to, from: opts.fromAddress, err: serialized });
    throw new Error(`ZeptoMail error: ${serialized}`);
  }
}
