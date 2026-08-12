/**
 * Sends a work-order confirmation email with the PDF document attached.
 *
 * Called fire-and-forget from the CREATE route — errors are logged, never
 * bubble up to the HTTP response.
 */
import { db, tenantsTable, staffTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendMail, getFromDetails, PLATFORM_COPY_ADDRESS } from "./mail";
import { renderWorkOrderPdf } from "./work-order-pdf";
import { getSetting, getAllSettings } from "../routes/settings";
import type { WorkOrderDocItem } from "./work-order-pdf";

export interface WorkOrderMailInput {
  tenantId: number;
  workOrderId: number;
  workOrderNumber: string;
  contactName: string | null;
  contactEmail: string | null;
  customerId: number | null;
  assignedStaffId: number | null;
  assignedStaffIds?: number[];   // full multi-technician list
  itemDescription: string;
  problemDescription: string;
  notes: string | null;
  scheduledDate: string | null;   // ISO string or null
  promisedDate: string | null;
  lineItems: WorkOrderDocItem[];
  currency: string;
}

async function getBusinessDetails(tenantId: number) {
  const [tenant, settings] = await Promise.all([
    db.query.tenantsTable.findFirst({ where: eq(tenantsTable.id, tenantId) }),
    getAllSettings(tenantId),
  ]);

  const logoUrl = settings["business_logo_url"] ?? null;
  let logoBuffer: Buffer | null = null;
  if (logoUrl) {
    try {
      const resp = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        logoBuffer = Buffer.from(ab);
      }
    } catch {
      // Logo fetch failed — PDF will render without it
    }
  }

  return {
    name: tenant?.businessName ?? "NEXXUS POS",
    address: settings["business_address"] ?? tenant?.address ?? null,
    phone: settings["business_phone"] ?? tenant?.phone ?? null,
    email: settings["from_email"] ?? PLATFORM_COPY_ADDRESS,
    logoBuffer,
  };
}

async function resolveToEmail(input: WorkOrderMailInput): Promise<string | null> {
  if (input.contactEmail?.trim()) return input.contactEmail.trim();
  if (input.customerId) {
    const customer = await db.query.customersTable.findFirst({
      where: and(
        eq(customersTable.id, input.customerId),
        eq(customersTable.tenantId, input.tenantId),
      ),
    });
    if (customer?.email?.trim()) return customer.email.trim();
  }
  return null;
}

async function resolveStaffNames(input: WorkOrderMailInput): Promise<string> {
  // Prefer the full multi-staff list; fall back to legacy single ID
  const ids = (input.assignedStaffIds && input.assignedStaffIds.length > 0)
    ? input.assignedStaffIds
    : input.assignedStaffId ? [input.assignedStaffId] : [];

  if (ids.length === 0) return "";

  const { inArray } = await import("drizzle-orm");
  const rows = await db
    .select({ id: staffTable.id, name: staffTable.name })
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, input.tenantId), inArray(staffTable.id, ids)));

  // Preserve the original order from `ids`
  const nameMap = new Map(rows.map((r) => [r.id, r.name]));
  return ids.map((id) => nameMap.get(id) ?? "").filter(Boolean).join(", ");
}

function formatScheduledDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

function buildEmailHtml(opts: {
  clientName: string;
  workOrderNumber: string;
  itemDescription: string;
  problemDescription: string;
  technicianName: string;
  scheduledVisit: string | null;
  promisedDate: string | null;
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
}): string {
  const scheduled = opts.scheduledVisit ? `<b>${opts.scheduledVisit}</b>` : "to be confirmed";
  const promised  = opts.promisedDate ? `<b>${opts.promisedDate}</b>` : "to be confirmed";
  const techLine  = opts.technicianName
    ? `<p>Your assigned technician is <b>${opts.technicianName}</b>.</p>`
    : "";
  const signPhone = opts.businessPhone ? ` | ${opts.businessPhone}` : "";
  const signEmail = opts.businessEmail ? ` | ${opts.businessEmail}` : "";

  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; background: #ffffff; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 0; }
    .header  { background: #f8f9fa; border-bottom: 3px solid #00AEEF; padding: 20px 32px; }
    .header h1 { margin: 0; font-size: 22px; color: #1a1a1a; }
    .header .sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .body    { padding: 28px 32px; }
    .body p  { margin: 0 0 14px; line-height: 1.6; }
    .details { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .details table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .details td { padding: 5px 6px; vertical-align: top; }
    .details td:first-child { font-weight: bold; color: #374151; width: 40%; }
    .details td:last-child  { color: #1a1a1a; }
    .footer  { background: #f8f9fa; border-top: 1px solid #e5e7eb; padding: 18px 32px; font-size: 12px; color: #6b7280; line-height: 1.6; }
    .footer .sig { font-weight: bold; color: #1a1a1a; margin-bottom: 2px; }
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${opts.businessName}</h1>
    <div class="sub">Work Order Confirmation</div>
  </div>
  <div class="body">
    <p>Good day${opts.clientName ? ` ${opts.clientName}` : ""},</p>

    <p>Thank you for entrusting us with your service request. Your work order has been created and is now in our system. Please find the official work order document attached to this email.</p>

    <div class="details">
      <table>
        <tr><td>Work Order #:</td><td><b>${opts.workOrderNumber}</b></td></tr>
        <tr><td>Item:</td><td>${opts.itemDescription}</td></tr>
        <tr><td>Issue Reported:</td><td>${opts.problemDescription}</td></tr>
        <tr><td>Scheduled Visit:</td><td>${scheduled}</td></tr>
        <tr><td>Estimated Completion:</td><td>${promised}</td></tr>
      </table>
    </div>

    ${techLine}

    <p>Our technician will contact you prior to the scheduled visit to confirm the appointment. Should you have any questions or need to reschedule, please do not hesitate to reach out.</p>

    <p>Please see the attached work order document. Please make the necessary arrangements to accommodate our technical team.</p>

    <p>Kind regards,</p>
  </div>
  <div class="footer">
    <div class="sig">${opts.businessName}</div>
    ${opts.businessPhone ? `<div>${opts.businessPhone}${opts.businessEmail ? ` &nbsp;|&nbsp; ${opts.businessEmail}` : ""}</div>` : ""}
    <div style="margin-top:12px;font-size:11px;color:#9ca3af;">
      This email and any files transmitted with it are confidential and intended solely for the use of
      the individual or entity to whom they are addressed.
    </div>
  </div>
</div>
</body>
</html>`.trim();
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const WORK_ORDER_STATUS_LABELS: Record<string, string> = {
  received:       "Received",
  in_progress:    "In Progress",
  awaiting_parts: "Awaiting Parts",
  on_hold:        "On Hold",
  ready:          "Ready for Pickup / Completed",
  collected:      "Collected / Closed",
  cancelled:      "Cancelled",
};

/** Field-service channels: the technician goes to the client, so nothing is "picked up". */
const FIELD_CHANNELS = new Set(["on_site", "remote"]);

/** Channel-aware status label — "ready" reads "Job Complete" for field visits, "Ready for Pickup" for drop-offs. */
export function workOrderStatusLabel(status: string, serviceChannel?: string | null): string {
  if (status === "ready") {
    return FIELD_CHANNELS.has(serviceChannel ?? "") ? "Job Complete" : "Ready for Pickup";
  }
  return WORK_ORDER_STATUS_LABELS[status] ?? status;
}

const STATUS_MESSAGES: Record<string, string> = {
  received:       "Your work order has been received and is in our queue.",
  in_progress:    "Our technician has started working on your job.",
  awaiting_parts: "Work is temporarily paused while we source the parts needed for your job.",
  on_hold:        "Your work order has been placed on hold. We will contact you with details.",
  collected:      "Your work order has been closed. Thank you for your business!",
  cancelled:      "Your work order has been cancelled. If this is unexpected, please contact us.",
};

function statusMessage(toStatus: string, serviceChannel?: string | null): string {
  if (toStatus === "ready") {
    return FIELD_CHANNELS.has(serviceChannel ?? "")
      ? "Great news — the work on your job has been completed."
      : "Great news — the work on your order has been completed and your item is ready for pickup.";
  }
  return STATUS_MESSAGES[toStatus] ?? "The status of your work order has been updated.";
}

/** Shared shell for the smaller status/sign-off notification emails. */
function buildNotificationHtml(opts: {
  businessName: string;
  businessPhone: string | null;
  businessEmail: string | null;
  headerSub: string;
  clientName: string;
  bodyHtml: string;
}): string {
  return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; color: #1a1a1a; background: #ffffff; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; }
  .header  { background: #f8f9fa; border-bottom: 3px solid #00AEEF; padding: 20px 32px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header .sub { font-size: 12px; color: #6b7280; margin-top: 4px; }
  .body    { padding: 28px 32px; }
  .body p  { margin: 0 0 14px; line-height: 1.6; }
  .details { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .details table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .details td { padding: 5px 6px; vertical-align: top; }
  .details td:first-child { font-weight: bold; color: #374151; width: 40%; }
  .footer  { background: #f8f9fa; border-top: 1px solid #e5e7eb; padding: 18px 32px; font-size: 12px; color: #6b7280; line-height: 1.6; }
  .footer .sig { font-weight: bold; color: #1a1a1a; margin-bottom: 2px; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${escHtml(opts.businessName)}</h1>
    <div class="sub">${escHtml(opts.headerSub)}</div>
  </div>
  <div class="body">
    <p>Good day${opts.clientName ? ` ${escHtml(opts.clientName)}` : ""},</p>
    ${opts.bodyHtml}
    <p>Kind regards,</p>
  </div>
  <div class="footer">
    <div class="sig">${escHtml(opts.businessName)}</div>
    ${opts.businessPhone ? `<div>${escHtml(opts.businessPhone)}${opts.businessEmail ? ` &nbsp;|&nbsp; ${escHtml(opts.businessEmail)}` : ""}</div>` : ""}
  </div>
</div>
</body>
</html>`.trim();
}

export interface WorkOrderStatusMailInput {
  tenantId: number;
  workOrderNumber: string;
  contactName: string | null;
  contactEmail: string | null;
  customerId: number | null;
  itemDescription: string;
  fromStatus: string | null;
  toStatus: string;
  serviceChannel?: string | null;
  changedByName?: string | null;
}

/**
 * Sends a status-change notification to the customer, copied to accounts@.
 * Safe to call fire-and-forget — errors are caught and logged only.
 */
export async function sendWorkOrderStatusEmail(input: WorkOrderStatusMailInput): Promise<void> {
  try {
    const toEmail = await resolveToEmail({
      contactEmail: input.contactEmail,
      customerId: input.customerId,
      tenantId: input.tenantId,
    } as WorkOrderMailInput);
    if (!toEmail) {
      console.info(`[work-order-mail] No recipient for status email WO ${input.workOrderNumber} — skipping`);
      return;
    }
    const [business, from] = await Promise.all([
      getBusinessDetails(input.tenantId),
      getFromDetails(input.tenantId),
    ]);

    const toLabel = workOrderStatusLabel(input.toStatus, input.serviceChannel);
    const fromLabel = input.fromStatus ? workOrderStatusLabel(input.fromStatus, input.serviceChannel) : null;
    const message = statusMessage(input.toStatus, input.serviceChannel);

    const bodyHtml = `
    <p>${escHtml(message)}</p>
    <div class="details"><table>
      <tr><td>Work Order #:</td><td><b>${escHtml(input.workOrderNumber)}</b></td></tr>
      <tr><td>Item:</td><td>${escHtml(input.itemDescription)}</td></tr>
      ${fromLabel ? `<tr><td>Previous Status:</td><td>${escHtml(fromLabel)}</td></tr>` : ""}
      <tr><td>New Status:</td><td><b>${escHtml(toLabel)}</b></td></tr>
    </table></div>
    <p>If you have any questions, simply reply to this email or give us a call.</p>`;

    await sendMail({
      to: toEmail,
      subject: `Work Order ${input.workOrderNumber} – Status Update: ${toLabel}`,
      html: buildNotificationHtml({
        businessName: business.name,
        businessPhone: business.phone,
        businessEmail: business.email,
        headerSub: "Work Order Status Update",
        clientName: input.contactName ?? "",
        bodyHtml,
      }),
      fromName: from.fromName,
      fromAddress: from.fromAddress,
      tenantId: input.tenantId,
      platformCopy: true, // per business policy: all work-order status emails are copied to accounts@
    });
    console.info(`[work-order-mail] Sent status email (${input.fromStatus} → ${input.toStatus}) to ${toEmail} (${input.workOrderNumber})`);
  } catch (err) {
    console.error("[work-order-mail] Failed to send status email", {
      wo: input.workOrderNumber,
      tenantId: input.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface WorkOrderSignedMailInput extends WorkOrderMailInput {
  signature: {
    svgDataUrl: string;
    signedBy: string;
    signedAt: Date;
  };
}

/**
 * Sends the signed completion copy to the customer (PDF with the drawn
 * signature attached), copied to accounts@. Fire-and-forget safe.
 */
export async function sendWorkOrderSignedEmail(input: WorkOrderSignedMailInput): Promise<void> {
  try {
    const [toEmail, staffName, business, from] = await Promise.all([
      resolveToEmail(input),
      resolveStaffNames(input),
      getBusinessDetails(input.tenantId),
      getFromDetails(input.tenantId),
    ]);
    if (!toEmail) {
      console.info(`[work-order-mail] No recipient for signed copy WO ${input.workOrderNumber} — skipping`);
      return;
    }

    const pdfBuffer = await renderWorkOrderPdf({
      workOrderNumber:     input.workOrderNumber,
      dateIssued:          new Date(),
      clientName:          input.contactName ?? "Customer",
      techniciansAssigned: staffName,
      scheduledVisit:      formatScheduledDate(input.scheduledDate),
      itemDescription:     input.itemDescription,
      scopeOfWork:         input.problemDescription,
      lineItems:           input.lineItems,
      notes:               input.notes,
      currency:            input.currency,
      business,
      signature:           input.signature,
    });

    const signedOn = input.signature.signedAt.toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });

    const bodyHtml = `
    <p>Thank you for confirming the completed work on your work order. A signed copy of the completion document is attached to this email for your records.</p>
    <div class="details"><table>
      <tr><td>Work Order #:</td><td><b>${escHtml(input.workOrderNumber)}</b></td></tr>
      <tr><td>Item:</td><td>${escHtml(input.itemDescription)}</td></tr>
      <tr><td>Signed By:</td><td>${escHtml(input.signature.signedBy)}</td></tr>
      <tr><td>Signed On:</td><td>${escHtml(signedOn)}</td></tr>
    </table></div>
    <p>If anything about the completed work is not to your satisfaction, please reply to this email or contact us right away.</p>`;

    await sendMail({
      to: toEmail,
      subject: `Work Order ${input.workOrderNumber} – Signed Completion Confirmation`,
      html: buildNotificationHtml({
        businessName: business.name,
        businessPhone: business.phone,
        businessEmail: business.email,
        headerSub: "Signed Completion Confirmation",
        clientName: input.contactName ?? "",
        bodyHtml,
      }),
      fromName: from.fromName,
      fromAddress: from.fromAddress,
      tenantId: input.tenantId,
      platformCopy: true, // signed copies are always copied to accounts@
      attachments: [{
        filename: `Work-Order-${input.workOrderNumber}-Signed.pdf`,
        content:  pdfBuffer,
        mimeType: "application/pdf",
      }],
    });
    console.info(`[work-order-mail] Sent signed copy to ${toEmail} (${input.workOrderNumber})`);
  } catch (err) {
    console.error("[work-order-mail] Failed to send signed copy email", {
      wo: input.workOrderNumber,
      tenantId: input.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Generates and sends the work order confirmation email.
 * Safe to call fire-and-forget — errors are caught and logged only.
 */
export async function sendWorkOrderEmail(input: WorkOrderMailInput): Promise<void> {
  try {
    const [toEmail, staffName, business, from, currency] = await Promise.all([
      resolveToEmail(input),
      resolveStaffNames(input),
      getBusinessDetails(input.tenantId),
      getFromDetails(input.tenantId),
      Promise.resolve(input.currency),
    ]);

    if (!toEmail) {
      console.info(`[work-order-mail] No recipient email for WO ${input.workOrderNumber} — skipping`);
      return;
    }

    const scheduledLabel = formatScheduledDate(input.scheduledDate);
    const promisedLabel  = formatScheduledDate(input.promisedDate);

    const [pdfBuffer] = await Promise.all([
      renderWorkOrderPdf({
        workOrderNumber:      input.workOrderNumber,
        dateIssued:           new Date(),
        clientName:           input.contactName ?? "Customer",
        techniciansAssigned:  staffName,
        scheduledVisit:       scheduledLabel,
        itemDescription:      input.itemDescription,
        scopeOfWork:          input.problemDescription,
        lineItems:            input.lineItems,
        notes:                input.notes,
        currency,
        business,
      }),
    ]);

    const html = buildEmailHtml({
      clientName:        input.contactName ?? "",
      workOrderNumber:   input.workOrderNumber,
      itemDescription:   input.itemDescription,
      problemDescription: input.problemDescription,
      technicianName:    staffName,
      scheduledVisit:    scheduledLabel,
      promisedDate:      promisedLabel,
      businessName:      business.name,
      businessPhone:     business.phone,
      businessEmail:     business.email,
    });

    await sendMail({
      to:          toEmail,
      subject:     `Work Order ${input.workOrderNumber} – ${input.itemDescription}`,
      html,
      fromName:    from.fromName,
      fromAddress: from.fromAddress,
      tenantId:    input.tenantId,
      platformCopy: false, // tenant→customer email, not copied to accounts@
      attachments: [{
        filename: `Work-Order-${input.workOrderNumber}.pdf`,
        content:  pdfBuffer,
        mimeType: "application/pdf",
      }],
    });

    console.info(`[work-order-mail] Sent WO confirmation to ${toEmail} (${input.workOrderNumber})`);
  } catch (err) {
    console.error("[work-order-mail] Failed to send work order email", {
      wo: input.workOrderNumber,
      tenantId: input.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/* ─── Completion OTP ─────────────────────────────────────────────────────────── */

/** Base URL for public customer links (portal / review). */
export function publicAppBaseUrl(): string {
  if (process.env["APP_BASE_URL"]) return process.env["APP_BASE_URL"];
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) return `https://${domains.split(",")[0]}`;
  return "";
}

/**
 * Emails the customer a one-time code the technician can use to verify job
 * completion when the customer can't or prefers not to sign.
 */
export async function sendCompletionOtpEmail(input: {
  tenantId: number;
  workOrderNumber: string;
  contactName: string | null;
  contactEmail: string | null;
  customerId: number | null;
  itemDescription: string;
  code: string;
  expiresMinutes: number;
}): Promise<{ sentTo: string } | { error: string }> {
  const toEmail = await resolveToEmail({
    contactEmail: input.contactEmail,
    customerId: input.customerId,
    tenantId: input.tenantId,
  } as WorkOrderMailInput);
  if (!toEmail) return { error: "No customer email on file" };

  const [business, from] = await Promise.all([
    getBusinessDetails(input.tenantId),
    getFromDetails(input.tenantId),
  ]);

  const bodyHtml = `
    <p>Your technician has finished the job below and asked us to send you a verification code. Read this code back to the technician to confirm the work is complete — it replaces a signature.</p>
    <div class="details"><table>
      <tr><td>Work Order #:</td><td><b>${escHtml(input.workOrderNumber)}</b></td></tr>
      <tr><td>Item / Job:</td><td>${escHtml(input.itemDescription)}</td></tr>
    </table></div>
    <p style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:bold;padding:12px 24px;border:2px dashed #999;border-radius:8px;">${escHtml(input.code)}</span>
    </p>
    <p>This code expires in ${input.expiresMinutes} minutes. If you did not expect this email or the work is not complete, do not share the code.</p>`;

  await sendMail({
    to: toEmail,
    subject: `Your completion code for Work Order ${input.workOrderNumber}`,
    html: buildNotificationHtml({
      businessName: business.name,
      businessPhone: business.phone,
      businessEmail: business.email,
      headerSub: "Job Completion Verification",
      clientName: input.contactName ?? "",
      bodyHtml,
    }),
    fromName: from.fromName,
    fromAddress: from.fromAddress,
    tenantId: input.tenantId,
    platformCopy: false, // contains a secret code — never copy anyone
  });
  console.info(`[work-order-mail] Sent completion OTP to ${toEmail} (${input.workOrderNumber})`);
  return { sentTo: toEmail };
}

/* ─── Review request ─────────────────────────────────────────────────────────── */

/**
 * Emails the customer a link to rate the completed job on the public portal.
 * Safe to call fire-and-forget.
 */
export async function sendWorkOrderReviewEmail(input: {
  tenantId: number;
  workOrderId: number;
  workOrderNumber: string;
  contactName: string | null;
  contactEmail: string | null;
  customerId: number | null;
  itemDescription: string;
  portalToken: string;
}): Promise<void> {
  try {
    const toEmail = await resolveToEmail({
      contactEmail: input.contactEmail,
      customerId: input.customerId,
      tenantId: input.tenantId,
    } as WorkOrderMailInput);
    if (!toEmail) {
      console.info(`[work-order-mail] No recipient for review email WO ${input.workOrderNumber} — skipping`);
      return;
    }
    const base = publicAppBaseUrl();
    if (!base) { console.warn("[work-order-mail] No public base URL — skipping review email"); return; }
    const link = `${base}/wo/${input.workOrderId}/${input.portalToken}#review`;

    const [business, from] = await Promise.all([
      getBusinessDetails(input.tenantId),
      getFromDetails(input.tenantId),
    ]);

    const bodyHtml = `
    <p>Thank you for choosing ${escHtml(business.name)}! Your job below has been completed.</p>
    <div class="details"><table>
      <tr><td>Work Order #:</td><td><b>${escHtml(input.workOrderNumber)}</b></td></tr>
      <tr><td>Item / Job:</td><td>${escHtml(input.itemDescription)}</td></tr>
    </table></div>
    <p>We'd love to hear how we did. It only takes a moment:</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:8px;">Rate your experience</a>
    </p>
    <p style="font-size:12px;color:#777;">If the button doesn't work, copy this link into your browser:<br>${escHtml(link)}</p>`;

    await sendMail({
      to: toEmail,
      subject: `How did we do? — Work Order ${input.workOrderNumber}`,
      html: buildNotificationHtml({
        businessName: business.name,
        businessPhone: business.phone,
        businessEmail: business.email,
        headerSub: "Rate Your Experience",
        clientName: input.contactName ?? "",
        bodyHtml,
      }),
      fromName: from.fromName,
      fromAddress: from.fromAddress,
      tenantId: input.tenantId,
      platformCopy: true,
    });
    console.info(`[work-order-mail] Sent review request to ${toEmail} (${input.workOrderNumber})`);
  } catch (err) {
    console.error("[work-order-mail] Failed to send review email", { wo: input.workOrderNumber, err: err instanceof Error ? err.message : err });
  }
}
