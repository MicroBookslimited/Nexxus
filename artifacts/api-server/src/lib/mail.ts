import { SendMailClient } from "zeptomail";
import nodemailer from "nodemailer";
import { getSetting, getAllSettings } from "../routes/settings";

const ZEPTOMAIL_API_URL = "api.zeptomail.com/";

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

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromAddress: string;
  tenantId?: number;
}): Promise<{ messageId?: string }> {
  const tenantId = opts.tenantId ?? 0;
  const provider = await getSetting("email_provider", tenantId);

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
    const info = await transport.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return { messageId: info.messageId };
  }

  const token = process.env["ZEPTOMAIL_TOKEN"];
  if (!token) throw new Error("ZEPTOMAIL_TOKEN is not configured. Please add it to your environment secrets.");
  const zepto = new SendMailClient({ url: ZEPTOMAIL_API_URL, token });
  const response = await zepto.sendMail({
    from: { address: opts.fromAddress, name: opts.fromName },
    to: [{ email_address: { address: opts.to, name: "" } }],
    subject: opts.subject,
    htmlbody: opts.html,
  });
  return { messageId: (response as { data?: { message_id?: string } })?.data?.message_id };
}

