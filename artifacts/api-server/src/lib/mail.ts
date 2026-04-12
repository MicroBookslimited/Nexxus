import { Resend } from "resend";
import { SendMailClient } from "zeptomail";
import { getSetting } from "../routes/settings";

const ZEPTOMAIL_API_URL = "api.zeptomail.com/";

export async function getFromDetails(): Promise<{ fromAddress: string; fromName: string }> {
  const [fromAddress, fromName] = await Promise.all([
    getSetting("from_email"),
    getSetting("from_name"),
  ]);
  return {
    fromAddress: fromAddress || "noreply@microbookspos.com",
    fromName: fromName || "NEXXUS POS",
  };
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName: string;
  fromAddress: string;
}): Promise<{ messageId?: string }> {
  const provider = (await getSetting("email_provider")) === "zeptomail" ? "zeptomail" : "resend";

  if (provider === "zeptomail") {
    const token = process.env["ZEPTOMAIL_TOKEN"];
    if (!token) throw new Error("ZEPTOMAIL_TOKEN is not configured");
    const zepto = new SendMailClient({ url: ZEPTOMAIL_API_URL, token });
    const response = await zepto.sendMail({
      from: { address: opts.fromAddress, name: opts.fromName },
      to: [{ email_address: { address: opts.to } }],
      subject: opts.subject,
      htmlbody: opts.html,
    });
    return { messageId: (response as { data?: { message_id?: string } })?.data?.message_id };
  } else {
    const key = process.env["RESEND_API_KEY"];
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: `${opts.fromName} <${opts.fromAddress}>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
}
