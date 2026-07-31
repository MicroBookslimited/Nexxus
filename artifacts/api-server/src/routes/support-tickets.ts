import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { db, supportTicketsTable, appSettingsTable, tenantsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { getFromDetails, sendMail, PLATFORM_COPY_ADDRESS } from "../lib/mail";
import jwt from "jsonwebtoken";
import { getSetting } from "./settings";

const router: IRouter = Router();

/** Fixed destination inbox for all support tickets. */
const SUPPORT_INBOX = "accounts@microbookssolutions.com";

const PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_RESPONSE: Record<Priority, string> = {
  CRITICAL: "Within 2 hours",
  HIGH: "Within 4 hours",
  NORMAL: "Within 24 hours",
  LOW: "Within 48 hours",
};
const PRIORITY_COLOR: Record<Priority, string> = {
  CRITICAL: "#DC2626",
  HIGH: "#EA580C",
  NORMAL: "#2563EB",
  LOW: "#6B7280",
};

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/** TKT-YYYYMMDD-XXXX (4 random uppercase alphanumerics). */
function generateTicketRef(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `TKT-${y}${m}${d}-${suffix}`;
}

function s(v: unknown, max = 2000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function normalizePriority(v: unknown): Priority {
  const up = typeof v === "string" ? v.trim().toUpperCase() : "";
  return (PRIORITIES as readonly string[]).includes(up) ? (up as Priority) : "NORMAL";
}

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTicketEmailHtml(t: {
  ticketRef: string;
  priority: Priority;
  businessName: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  category: string;
  subCategory: string;
  impact: string | null;
  startedWhen: string | null;
  stepsTaken: string[];
  additionalNotes: string | null;
  createdAt: Date;
}): string {
  const color = PRIORITY_COLOR[t.priority];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;font-weight:500">${esc(value)}</td></tr>`;
  const steps = t.stepsTaken.length
    ? `<ul style="margin:4px 0 0;padding-left:18px;color:#0f172a;font-size:14px">${t.stepsTaken.map((x) => `<li style="margin:2px 0">${esc(x)}</li>`).join("")}</ul>`
    : "<span style=\"color:#94a3b8\">None recorded</span>";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:${color};padding:18px 24px">
        <div style="color:#fff;font-size:13px;letter-spacing:1px;opacity:.85">NEXXUS POS SUPPORT · ${esc(t.priority)}</div>
        <div style="color:#fff;font-size:22px;font-weight:700;margin-top:2px">${esc(t.ticketRef)}</div>
        <div style="color:#fff;font-size:13px;opacity:.9;margin-top:2px">Target response: ${esc(PRIORITY_RESPONSE[t.priority])}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:8px 0">
        ${row("Business", t.businessName)}
        ${t.contactName ? row("Contact", t.contactName) : ""}
        ${t.contactPhone ? row("Phone", t.contactPhone) : ""}
        ${t.contactEmail ? row("Email", t.contactEmail) : ""}
        ${row("Category", t.category)}
        ${row("Sub-category", t.subCategory)}
        ${t.impact ? row("Impact", t.impact) : ""}
        ${t.startedWhen ? row("Started", t.startedWhen) : ""}
        <tr><td style="padding:6px 12px;color:#64748b;font-size:13px;vertical-align:top">Steps taken</td><td style="padding:6px 12px">${steps}</td></tr>
        ${t.additionalNotes ? `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;vertical-align:top">Notes</td><td style="padding:6px 12px;color:#0f172a;font-size:14px;white-space:pre-wrap">${esc(t.additionalNotes)}</td></tr>` : ""}
        ${row("Submitted", t.createdAt.toLocaleString("en-JM", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }))}
      </table>
    </div>
  </div>`;
}

/* ─── Superadmin auth helper ─── */
function getJwtSecret(): string {
  return process.env["SESSION_SECRET"] ?? "nexus-pos-secret";
}

function requireSuperAdmin(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (b: object) => void } },
): boolean {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  try {
    const p = jwt.verify(auth.slice(7), getJwtSecret()) as { type?: string };
    if (p.type !== "superadmin") { res.status(403).json({ error: "Forbidden" }); return false; }
    return true;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return false;
  }
}

const SUPPORT_INBOX_KEY = "support_inbox_email";
const DEFAULT_SUPPORT_INBOX = "accounts@microbookssolutions.com";

/** Resolves the current support inbox — DB setting takes precedence over constant. */
async function getSupportInbox(): Promise<string> {
  const saved = await getSetting(SUPPORT_INBOX_KEY, 0);
  return saved || DEFAULT_SUPPORT_INBOX;
}

/* ─── Superadmin: list all support tickets ─── */
router.get("/superadmin/support/tickets", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;

  const status = (req.query["status"] as string | undefined)?.trim();
  const priority = (req.query["priority"] as string | undefined)?.trim().toUpperCase();
  const q = (req.query["q"] as string | undefined)?.trim();

  const conditions = [];
  if (status && status !== "all") conditions.push(eq(supportTicketsTable.status, status));
  if (priority && priority !== "ALL") conditions.push(eq(supportTicketsTable.priority, priority));
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(supportTicketsTable.ticketRef, like),
        ilike(supportTicketsTable.businessName, like),
        ilike(supportTicketsTable.category, like),
        ilike(supportTicketsTable.subCategory, like),
      ),
    );
  }

  const rows = await db
    .select()
    .from(supportTicketsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supportTicketsTable.createdAt))
    .limit(200);

  res.json(rows);
});

/* ─── Superadmin: update ticket status / add admin notes ─── */
router.patch("/superadmin/support/tickets/:id", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;

  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const updates: Partial<typeof supportTicketsTable.$inferInsert> & { updatedAt?: Date } = {
    updatedAt: new Date(),
  };
  if (typeof b["status"] === "string" && b["status"].trim()) {
    updates.status = b["status"].trim().slice(0, 50);
  }
  if (typeof b["adminNotes"] === "string") {
    updates.adminNotes = b["adminNotes"].slice(0, 4000) || null;
  }

  const [updated] = await db
    .update(supportTicketsTable)
    .set(updates)
    .where(eq(supportTicketsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Ticket not found" }); return; }
  res.json(updated);
});

/* ─── Superadmin: get support settings (inbox email) ─── */
router.get("/superadmin/support/settings", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;
  const email = await getSupportInbox();
  res.json({ supportInboxEmail: email });
});

/* ─── Superadmin: update support settings ─── */
router.patch("/superadmin/support/settings", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof b["supportInboxEmail"] === "string" ? b["supportInboxEmail"].trim().slice(0, 200) : null;
  if (!email || !email.includes("@")) { res.status(400).json({ error: "Valid email required" }); return; }

  await db
    .insert(appSettingsTable)
    .values({ key: `0:${SUPPORT_INBOX_KEY}`, tenantId: 0, value: email, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: email, updatedAt: new Date() } });

  res.json({ supportInboxEmail: email });
});

/* ─── Create a support ticket ─── */
router.post("/support/tickets", async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const businessName = s(b["businessName"], 200);
  const category = s(b["category"], 120);
  const subCategory = s(b["subCategory"], 200);
  if (!businessName || !category || !subCategory) {
    return res.status(400).json({ error: "businessName, category and subCategory are required" });
  }

  const priority = normalizePriority(b["priority"]);
  const stepsTaken = Array.isArray(b["stepsTaken"])
    ? (b["stepsTaken"] as unknown[]).map((x) => String(x).slice(0, 300)).filter(Boolean).slice(0, 30)
    : [];

  const record = {
    tenantId,
    businessName,
    contactName: s(b["contactName"], 200),
    contactPhone: s(b["contactPhone"], 60),
    contactEmail: s(b["contactEmail"], 200),
    category,
    subCategory,
    impact: s(b["impact"], 400),
    priority,
    startedWhen: s(b["startedWhen"], 200),
    stepsTaken,
    additionalNotes: s(b["additionalNotes"], 4000),
    resolutionType: null as string | null,
    status: "open",
  };

  // Insert with a short collision-retry loop on the unique ticket_ref.
  let inserted: typeof supportTicketsTable.$inferSelect | null = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    const ticketRef = generateTicketRef();
    try {
      const [row] = await db
        .insert(supportTicketsTable)
        .values({ ...record, ticketRef })
        .returning();
      inserted = row ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      req.log.error({ err }, "support ticket insert failed");
      return res.status(500).json({ error: "Could not save your ticket. Please try again." });
    }
  }
  if (!inserted) {
    return res.status(500).json({ error: "Could not generate a ticket reference. Please try again." });
  }

  // Email the support inbox — non-blocking: the ticket is already saved.
  void (async () => {
    try {
      const { fromAddress, fromName } = await getFromDetails(tenantId);
      await sendMail({
        platformCopy: true,
        to: SUPPORT_INBOX,
        cc: record.contactEmail || undefined,
        subject: `[${priority}] ${inserted!.ticketRef} — ${businessName}: ${subCategory}`,
        html: buildTicketEmailHtml({
          ticketRef: inserted!.ticketRef,
          priority,
          businessName,
          contactName: record.contactName,
          contactPhone: record.contactPhone,
          contactEmail: record.contactEmail,
          category,
          subCategory,
          impact: record.impact,
          startedWhen: record.startedWhen,
          stepsTaken,
          additionalNotes: record.additionalNotes,
          createdAt: inserted!.createdAt,
        }),
        fromName,
        fromAddress,
        tenantId,
      });
    } catch (err) {
      req.log.error({ err, ticketRef: inserted!.ticketRef }, "support ticket email failed");
    }
  })();

  return res.status(201).json({
    id: inserted.id,
    ticketRef: inserted.ticketRef,
    priority,
    responseTarget: PRIORITY_RESPONSE[priority],
  });
});

/* ─── Superadmin: create a ticket on behalf of a client ─── */
const REPORT_SOURCES = ["Whatsapp", "Email", "Phone", "SMS", "Office Visit", "Client Visit", "Other"] as const;

router.post("/superadmin/support/tickets", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;

  const b = (req.body ?? {}) as Record<string, unknown>;

  // tenantId is required — businessName is derived from the tenant record
  const tenantIdRaw = b["tenantId"];
  const tenantId = typeof tenantIdRaw === "number" && Number.isInteger(tenantIdRaw) && tenantIdRaw > 0 ? tenantIdRaw : 0;
  if (!tenantId) {
    res.status(400).json({ error: "tenantId is required and must be a valid registered tenant" });
    return;
  }

  const tenant = await db.select({ businessName: tenantsTable.businessName })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1)
    .then(r => r[0] ?? null);
  if (!tenant) {
    res.status(400).json({ error: "Tenant not found" });
    return;
  }
  const businessName = tenant.businessName;

  const category = s(b["category"], 120);
  const subCategory = s(b["subCategory"], 200);
  if (!category || !subCategory) {
    res.status(400).json({ error: "category and subCategory are required" });
    return;
  }
  const reportSource = s(b["reportSource"], 50);
  if (!reportSource || !(REPORT_SOURCES as readonly string[]).includes(reportSource)) {
    res.status(400).json({ error: "reportSource is required and must be one of: " + REPORT_SOURCES.join(", ") });
    return;
  }

  const priority = normalizePriority(b["priority"]);
  const stepsTaken = Array.isArray(b["stepsTaken"])
    ? (b["stepsTaken"] as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 20)
    : [];

  const record = {
    tenantId,
    businessName,
    contactName: s(b["contactName"], 200),
    contactPhone: s(b["contactPhone"], 50),
    contactEmail: s(b["contactEmail"], 200),
    category,
    subCategory,
    impact: s(b["impact"], 500),
    priority,
    startedWhen: s(b["startedWhen"], 200),
    stepsTaken,
    additionalNotes: s(b["additionalNotes"], 4000),
    reportSource,
  };

  let inserted: typeof supportTicketsTable.$inferSelect | null = null;
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    const ticketRef = generateTicketRef();
    try {
      const [row] = await db
        .insert(supportTicketsTable)
        .values({ ...record, ticketRef })
        .returning();
      inserted = row ?? null;
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      req.log.error({ err }, "superadmin support ticket insert failed");
      res.status(500).json({ error: "Could not save the ticket. Please try again." });
      return;
    }
  }
  if (!inserted) {
    res.status(500).json({ error: "Could not generate a ticket reference. Please try again." });
    return;
  }

  // Email the support inbox — non-blocking, ticket is already saved.
  void (async () => {
    try {
      const { fromAddress, fromName } = await getFromDetails(tenantId);
      await sendMail({
        platformCopy: true,
        to: SUPPORT_INBOX,
        cc: record.contactEmail || undefined,
        subject: `[${priority}] ${inserted!.ticketRef} — ${businessName}: ${record.subCategory} (logged via ${reportSource})`,
        html: buildTicketEmailHtml({
          ticketRef: inserted!.ticketRef,
          priority,
          businessName,
          contactName: record.contactName,
          contactPhone: record.contactPhone,
          contactEmail: record.contactEmail,
          category: record.category,
          subCategory: record.subCategory,
          impact: record.impact,
          startedWhen: record.startedWhen,
          stepsTaken,
          additionalNotes: record.additionalNotes,
          createdAt: inserted!.createdAt,
        }),
        fromName,
        fromAddress,
        tenantId,
      });
    } catch (err) {
      // Email failure is non-fatal — ticket is already saved
      console.error({ err, ticketRef: inserted!.ticketRef }, "superadmin support ticket email failed");
    }
  })();

  res.status(201).json(inserted);
});

/* ─── Superadmin: send a reply email to the ticket submitter ─── */
router.post("/superadmin/support/tickets/:id/reply", async (req, res): Promise<void> => {
  if (!requireSuperAdmin(req, res as never)) return;

  const id = parseInt(req.params["id"] ?? "", 10);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const b = (req.body ?? {}) as Record<string, unknown>;
  const message = s(b["message"], 4000);
  if (!message) { res.status(400).json({ error: "message is required" }); return; }

  const ticket = await db.query.supportTicketsTable.findFirst({
    where: eq(supportTicketsTable.id, id),
  });
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }
  if (!ticket.contactEmail) { res.status(422).json({ error: "Ticket has no contact email" }); return; }

  const { fromAddress, fromName } = await getFromDetails(0);
  await sendMail({
    platformCopy: false, // accounts@ is already CC'd explicitly — avoid a duplicate BCC copy
    to: ticket.contactEmail,
    cc: PLATFORM_COPY_ADDRESS,
    subject: `Re: [${ticket.ticketRef}] — ${ticket.businessName}: ${ticket.subCategory}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:#2563EB;padding:18px 24px">
            <div style="color:#fff;font-size:13px;letter-spacing:1px;opacity:.85">NEXXUS POS SUPPORT · RESPONSE</div>
            <div style="color:#fff;font-size:22px;font-weight:700;margin-top:2px">${esc(ticket.ticketRef)}</div>
          </div>
          <div style="padding:24px">
            <p style="margin:0 0 16px;font-size:14px;color:#334155">Hi${ticket.contactName ? ` ${esc(ticket.contactName)}` : ""},</p>
            <p style="margin:0 0 16px;font-size:14px;color:#334155">Thank you for contacting NEXXUS POS support. Here is our response regarding your ticket:</p>
            <div style="background:#f8fafc;border-left:4px solid #2563EB;border-radius:4px;padding:16px;margin:0 0 16px;font-size:14px;color:#0f172a;white-space:pre-wrap">${esc(message)}</div>
            <p style="margin:0;font-size:13px;color:#64748b">If you need further assistance, reply to this email or submit a new ticket.</p>
          </div>
        </div>
      </div>`,
    fromName,
    fromAddress,
    tenantId: 0,
  });

  res.json({ ok: true });
});

/* ─── Log a self-resolved FAQ hit (no email) ─── */
router.post("/support/self-resolved", async (req, res) => {
  const tenantId = getTenantId(req);
  if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

  const b = (req.body ?? {}) as Record<string, unknown>;
  const businessName = s(b["businessName"], 200) ?? "Unknown";
  const category = s(b["category"], 120);
  const subCategory = s(b["subCategory"], 200);
  if (!category || !subCategory) {
    return res.status(400).json({ error: "category and subCategory are required" });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const ticketRef = generateTicketRef();
    try {
      await db.insert(supportTicketsTable).values({
        tenantId,
        ticketRef,
        businessName,
        category,
        subCategory,
        priority: "LOW",
        resolutionType: "self_resolved",
        status: "resolved",
      });
      return res.status(201).json({ success: true });
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      req.log.error({ err }, "self-resolved log failed");
      // Non-critical analytics write — don't surface an error to the user.
      return res.status(200).json({ success: false });
    }
  }
  return res.status(200).json({ success: false });
});

export default router;
