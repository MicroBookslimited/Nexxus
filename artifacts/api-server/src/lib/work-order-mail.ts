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
