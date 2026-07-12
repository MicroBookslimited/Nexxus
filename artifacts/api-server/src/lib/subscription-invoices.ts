import {
  db, subscriptionInvoicesTable, subscriptionPlansTable, tenantsTable,
  type SubscriptionInvoice,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";
import { getFromDetails, sendMail, type MailAttachment } from "./mail";
import { renderInvoicePdf, renderReceiptPdf, type BillingDocData } from "./subscription-pdf";

export interface IssueInvoiceParams {
  tenantId: number;
  planId: number | null;
  planName: string;
  billingCycle: string;
  amount: number;
  currency?: string;
  provider: "paypal" | "powertranz" | "manual";
  paymentMethodLabel: string;
  providerRef?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  paidAt?: Date;
}

function pad(n: number): string {
  return String(n).padStart(5, "0");
}

function fmtRange(start?: Date | null, end?: Date | null): string {
  if (!start || !end) return "";
  const s = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start);
  const e = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(end);
  return `${s} – ${e}`;
}

function toDocData(rec: SubscriptionInvoice): BillingDocData {
  const range = fmtRange(rec.periodStart, rec.periodEnd);
  const description = `NEXXUS POS — ${rec.planName} (${rec.billingCycle})${range ? `\n${range}` : ""}`;
  return {
    invoiceNumber: rec.invoiceNumber,
    receiptNumber: rec.receiptNumber,
    planName: rec.planName,
    billingCycle: rec.billingCycle,
    description,
    amount: rec.amount,
    currency: rec.currency,
    paymentMethodLabel: rec.paymentMethodLabel || "",
    issuedAt: rec.issuedAt,
    dueDate: rec.paidAt,
    paidAt: rec.paidAt,
    billTo: { name: rec.billToName, email: rec.billToEmail, address: rec.billToAddress },
  };
}

function emailHtml(rec: SubscriptionInvoice): string {
  const amount = (() => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: rec.currency }).format(rec.amount); }
    catch { return `${rec.currency} ${rec.amount.toFixed(2)}`; }
  })();
  const paid = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(rec.paidAt);
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid #00AEEF;padding-bottom:12px;margin-bottom:20px">
      <span style="font-size:22px;font-weight:bold;color:#00AEEF">MicroBooks</span>
    </div>
    <h2 style="margin:0 0 4px">Thank you for your payment</h2>
    <p style="color:#6b7280;margin:0 0 20px">Your NEXXUS POS subscription is confirmed.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#6b7280">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600">${rec.planName} (${rec.billingCycle})</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Amount paid</td><td style="padding:6px 0;text-align:right;font-weight:700">${amount}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Date paid</td><td style="padding:6px 0;text-align:right">${paid}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Invoice</td><td style="padding:6px 0;text-align:right">${rec.invoiceNumber}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280">Receipt</td><td style="padding:6px 0;text-align:right">${rec.receiptNumber}</td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;margin-top:20px">Your invoice and receipt are attached as PDFs. Questions? Reply to this email or contact accounts@microbookssolutions.com.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px">MicroBooks Limited · Shop 15, 12A Molynes Road, Kingston 10, Jamaica · +1-876-787-1538</p>
  </div>`;
}

/**
 * Renders the two PDFs and emails them to the tenant. Updates the record's
 * email status. Throws only for genuine send failures (caller decides).
 */
export async function sendInvoiceEmail(rec: SubscriptionInvoice): Promise<void> {
  const docData = toDocData(rec);
  const [invoicePdf, receiptPdf] = await Promise.all([
    renderInvoicePdf(docData),
    renderReceiptPdf(docData),
  ]);
  const attachments: MailAttachment[] = [
    { filename: `Invoice-${rec.invoiceNumber}.pdf`, content: invoicePdf, mimeType: "application/pdf" },
    { filename: `Receipt-${rec.receiptNumber}.pdf`, content: receiptPdf, mimeType: "application/pdf" },
  ];
  const { fromAddress } = await getFromDetails(0);
  const to = rec.billToEmail;
  if (!to) throw new Error("Tenant has no billing email");
  await sendMail({
    to,
    subject: `Your NEXXUS POS receipt ${rec.receiptNumber}`,
    html: emailHtml(rec),
    fromName: "MicroBooks",
    fromAddress,
    tenantId: 0,
    attachments,
  });
  await db.update(subscriptionInvoicesTable)
    .set({ emailedAt: new Date(), emailStatus: "sent", emailError: null })
    .where(eq(subscriptionInvoicesTable.id, rec.id));
}

/**
 * Renders the two PDFs for an existing record (used for re-download).
 */
export async function renderInvoiceDocs(rec: SubscriptionInvoice): Promise<{ invoice: Buffer; receipt: Buffer }> {
  const docData = toDocData(rec);
  const [invoice, receipt] = await Promise.all([
    renderInvoicePdf(docData),
    renderReceiptPdf(docData),
  ]);
  return { invoice, receipt };
}

/**
 * Creates a billing document record for a subscription payment and emails the
 * Invoice + Receipt PDFs. Idempotent per (tenant, provider, providerRef).
 * Best-effort: never throws — a failure here must not break activation.
 */
export async function issueSubscriptionInvoice(params: IssueInvoiceParams): Promise<SubscriptionInvoice | null> {
  try {
    const currency = params.currency ?? "USD";

    // Idempotency: skip if we already issued for this exact provider reference.
    if (params.providerRef) {
      const [dupe] = await db.select().from(subscriptionInvoicesTable).where(and(
        eq(subscriptionInvoicesTable.tenantId, params.tenantId),
        eq(subscriptionInvoicesTable.provider, params.provider),
        eq(subscriptionInvoicesTable.providerRef, params.providerRef),
      ));
      if (dupe) return dupe;
    }

    const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, params.tenantId));
    if (!tenant) { logger.warn({ tenantId: params.tenantId }, "issueSubscriptionInvoice: tenant not found"); return null; }

    // Resolve plan name (fallback to provided) — keeps the printed doc accurate.
    let planName = params.planName;
    if (params.planId) {
      const [plan] = await db.select({ name: subscriptionPlansTable.name }).from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, params.planId));
      if (plan?.name) planName = plan.name;
    }

    const now = params.paidAt ?? new Date();
    const yy = String(now.getFullYear()).slice(-2);

    // Insert with placeholder numbers, then derive stable numbers from the row id.
    // onConflictDoNothing makes this race-safe against the partial unique index
    // (tenant_id, provider, provider_ref): a concurrent duplicate callback that
    // slipped past the check-then-read above will conflict and return no row.
    const insertedRows = await db.insert(subscriptionInvoicesTable).values({
      tenantId: params.tenantId,
      planId: params.planId,
      invoiceNumber: "PENDING",
      receiptNumber: "PENDING",
      planName,
      billingCycle: params.billingCycle,
      amount: params.amount,
      currency,
      provider: params.provider,
      paymentMethodLabel: params.paymentMethodLabel,
      providerRef: params.providerRef ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      billToName: tenant.businessName || tenant.ownerName || "",
      billToEmail: tenant.email || "",
      billToAddress: tenant.address ?? null,
      issuedAt: now,
      paidAt: now,
      emailStatus: "pending",
    }).onConflictDoNothing().returning();

    const inserted = insertedRows[0];
    if (!inserted) {
      // Lost the race — another caller already issued this exact document.
      if (params.providerRef) {
        const [existing] = await db.select().from(subscriptionInvoicesTable).where(and(
          eq(subscriptionInvoicesTable.tenantId, params.tenantId),
          eq(subscriptionInvoicesTable.provider, params.provider),
          eq(subscriptionInvoicesTable.providerRef, params.providerRef),
        ));
        if (existing) return existing;
      }
      logger.warn({ tenantId: params.tenantId, provider: params.provider, providerRef: params.providerRef },
        "issueSubscriptionInvoice: insert conflict but no existing row found");
      return null;
    }

    const invoiceNumber = `MB-INV-${yy}-${pad(inserted.id)}`;
    const receiptNumber = `MB-RCP-${yy}-${pad(inserted.id)}`;
    const [rec] = await db.update(subscriptionInvoicesTable)
      .set({ invoiceNumber, receiptNumber })
      .where(eq(subscriptionInvoicesTable.id, inserted.id))
      .returning();

    try {
      await sendInvoiceEmail(rec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, invoiceId: rec.id }, "issueSubscriptionInvoice: email failed");
      await db.update(subscriptionInvoicesTable)
        .set({ emailStatus: "failed", emailError: msg })
        .where(eq(subscriptionInvoicesTable.id, rec.id));
    }
    return rec;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, tenantId: params.tenantId }, "issueSubscriptionInvoice: failed");
    return null;
  }
}
