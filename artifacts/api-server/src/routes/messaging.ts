import { Router, type IRouter } from "express";
import { and, eq, gt, asc, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  messageThreadsTable,
  threadMessagesTable,
  threadReadsTable,
  workOrdersTable,
  staffTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { hasWorkOrdersEntitlement } from "../lib/addon-entitlement";
import { isFsmAdmin, assignedToStaff } from "./fsm";

/**
 * In-app messaging between the office and field technicians.
 *
 * Auth model: tenant JWT (Authorization: Bearer) + REQUIRED x-staff-id header.
 * The staff row is loaded from the database on every request — the sender's
 * name and their side of the conversation ("office" vs "technician") are
 * derived from that row and never trusted from the client.
 *
 * Visibility:
 *  - Office (admin/manager/owner) is a COLLECTIVE identity: any office user
 *    reads and replies in every thread in their tenant.
 *  - A technician sees their own direct thread plus the job threads of jobs
 *    they are currently assigned to (same predicate the FSM queue uses, so
 *    access follows assignment changes automatically).
 *
 * Text only — there is no attachment path anywhere in this router.
 */

const router: IRouter = Router();

/* Work Orders is a paid add-on and messaging is part of that module, so it
 * carries the same server-side entitlement gate as fsm.ts / work-orders.ts.
 * (Routers share the /api mount, so filter by path prefix.) */
router.use(async (req, res, next) => {
  if (!req.path.startsWith("/messaging/")) { next(); return; }
  const tenantId = getTenantId(req as never);
  if (!tenantId) { next(); return; } // let each route return its own 401
  if (await hasWorkOrdersEntitlement(tenantId)) { next(); return; }
  res.status(403).json({ error: "The Work Orders add-on is not active. Purchase it on the Subscription page to use this module." });
});

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

type MsgStaff = { id: number; name: string; role: string };

async function getVerifiedStaff(
  req: { headers: Record<string, string | undefined> },
  tenantId: number,
): Promise<MsgStaff | null> {
  const raw = req.headers["x-staff-id"];
  const staffId = raw ? parseInt(String(raw), 10) : NaN;
  if (!Number.isFinite(staffId)) return null;
  const [s] = await db
    .select({ id: staffTable.id, name: staffTable.name, role: staffTable.role })
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)));
  return s ?? null;
}

/** Resolve tenant + staff, writing the 401 itself when either is missing. */
async function authenticate(
  req: { headers: Record<string, string | undefined> },
  res: { status: (c: number) => { json: (b: unknown) => void } },
): Promise<{ tenantId: number; staff: MsgStaff } | null> {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const staff = await getVerifiedStaff(req, tenantId);
  if (!staff) { res.status(401).json({ error: "Sign in with your staff PIN to use messages" }); return null; }
  return { tenantId, staff };
}

const sideOf = (staff: MsgStaff): "office" | "technician" =>
  isFsmAdmin(staff) ? "office" : "technician";

const PREVIEW_MAX = 140;
const preview = (body: string): string =>
  body.length > PREVIEW_MAX ? `${body.slice(0, PREVIEW_MAX - 1)}…` : body;

type ThreadRow = typeof messageThreadsTable.$inferSelect;

/** Can this staff member read/write this thread right now? */
async function canAccessThread(tenantId: number, staff: MsgStaff, thread: ThreadRow): Promise<boolean> {
  if (isFsmAdmin(staff)) return true;
  if (thread.kind === "direct") return thread.staffId === staff.id;
  if (thread.kind === "job" && thread.workOrderId != null) {
    // Derived live from the current assignment — unassigning revokes access.
    const [row] = await db
      .select({ id: workOrdersTable.id })
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.id, thread.workOrderId),
        eq(workOrdersTable.tenantId, tenantId),
        assignedToStaff(staff.id),
      ));
    return !!row;
  }
  return false;
}

/** Load a thread by :id and authorise it, writing the error response on failure. */
async function loadThread(
  req: { headers: Record<string, string | undefined>; params: Record<string, string> },
  res: { status: (c: number) => { json: (b: unknown) => void } },
): Promise<{ tenantId: number; staff: MsgStaff; thread: ThreadRow } | null> {
  const auth = await authenticate(req, res);
  if (!auth) return null;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid thread id" }); return null; }
  const [thread] = await db
    .select()
    .from(messageThreadsTable)
    .where(and(eq(messageThreadsTable.id, id), eq(messageThreadsTable.tenantId, auth.tenantId)));
  if (!thread) { res.status(404).json({ error: "Conversation not found" }); return null; }
  if (!(await canAccessThread(auth.tenantId, auth.staff, thread))) {
    res.status(403).json({ error: "You don't have access to this conversation" });
    return null;
  }
  return { ...auth, thread };
}

/** Thread ids this staff member may see, newest activity first. */
function visibleThreadsQuery(tenantId: number, staff: MsgStaff) {
  const scope = isFsmAdmin(staff)
    ? sql`TRUE`
    : sql`(
        (${messageThreadsTable.kind} = 'direct' AND ${messageThreadsTable.staffId} = ${staff.id})
        OR (${messageThreadsTable.kind} = 'job' AND ${assignedToStaff(staff.id)})
      )`;
  return db
    .select({
      id: messageThreadsTable.id,
      kind: messageThreadsTable.kind,
      workOrderId: messageThreadsTable.workOrderId,
      staffId: messageThreadsTable.staffId,
      lastMessageId: messageThreadsTable.lastMessageId,
      lastMessageAt: messageThreadsTable.lastMessageAt,
      lastMessagePreview: messageThreadsTable.lastMessagePreview,
      lastMessageSenderName: messageThreadsTable.lastMessageSenderName,
      createdAt: messageThreadsTable.createdAt,
      workOrderNumber: workOrdersTable.workOrderNumber,
      workOrderItem: workOrdersTable.itemDescription,
      workOrderStatus: workOrdersTable.status,
      contactName: workOrdersTable.contactName,
      technicianName: staffTable.name,
    })
    .from(messageThreadsTable)
    // Tenant-scoped joins: never widen visibility through a related table.
    .leftJoin(workOrdersTable, and(
      eq(messageThreadsTable.workOrderId, workOrdersTable.id),
      eq(workOrdersTable.tenantId, tenantId),
    ))
    .leftJoin(staffTable, and(
      eq(messageThreadsTable.staffId, staffTable.id),
      eq(staffTable.tenantId, tenantId),
    ))
    .where(and(eq(messageThreadsTable.tenantId, tenantId), scope));
}

/** Unread = messages I did not send, newer than my read cursor. */
async function unreadByThread(
  tenantId: number,
  staffId: number,
  threadIds: number[],
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (threadIds.length === 0) return out;
  const rows = await db
    .select({ threadId: threadMessagesTable.threadId, count: sql<number>`count(*)::int` })
    .from(threadMessagesTable)
    .leftJoin(threadReadsTable, and(
      eq(threadReadsTable.threadId, threadMessagesTable.threadId),
      eq(threadReadsTable.staffId, staffId),
    ))
    .where(and(
      eq(threadMessagesTable.tenantId, tenantId),
      inArray(threadMessagesTable.threadId, threadIds),
      sql`${threadMessagesTable.id} > COALESCE(${threadReadsTable.lastReadMessageId}, 0)`,
      sql`(${threadMessagesTable.senderStaffId} IS NULL OR ${threadMessagesTable.senderStaffId} <> ${staffId})`,
    ))
    .groupBy(threadMessagesTable.threadId);
  for (const r of rows) out.set(r.threadId, Number(r.count));
  return out;
}

/* ───────────────────────── Inbox ───────────────────────── */

/** GET /messaging/threads — every conversation this person can see, with unread counts. */
router.get("/messaging/threads", async (req, res) => {
  try {
    const auth = await authenticate(req as never, res);
    if (!auth) return;
    const { tenantId, staff } = auth;

    const rows = await visibleThreadsQuery(tenantId, staff)
      .orderBy(desc(messageThreadsTable.lastMessageAt), desc(messageThreadsTable.id));
    const unread = await unreadByThread(tenantId, staff.id, rows.map((r) => r.id));

    res.json({
      side: sideOf(staff),
      threads: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        workOrderId: r.workOrderId,
        workOrderNumber: r.workOrderNumber,
        workOrderItem: r.workOrderItem,
        workOrderStatus: r.workOrderStatus,
        customerName: r.contactName,
        staffId: r.staffId,
        // For a technician, the other side is always "Office".
        title: r.kind === "job"
          ? (r.workOrderNumber ? `Job ${r.workOrderNumber}` : "Job")
          : (sideOf(staff) === "office" ? (r.technicianName ?? "Technician") : "Office"),
        lastMessageId: r.lastMessageId,
        lastMessageAt: r.lastMessageAt,
        lastMessagePreview: r.lastMessagePreview,
        lastMessageSenderName: r.lastMessageSenderName,
        unreadCount: unread.get(r.id) ?? 0,
      })),
    });
  } catch (err) {
    console.error("[messaging] list threads failed", err);
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

/** GET /messaging/unread-count — cheap badge poll. */
router.get("/messaging/unread-count", async (req, res) => {
  try {
    const auth = await authenticate(req as never, res);
    if (!auth) return;
    const { tenantId, staff } = auth;
    const rows = await visibleThreadsQuery(tenantId, staff);
    const unread = await unreadByThread(tenantId, staff.id, rows.map((r) => r.id));
    let total = 0;
    let threads = 0;
    for (const n of unread.values()) { if (n > 0) { total += n; threads += 1; } }
    res.json({ unreadCount: total, unreadThreads: threads });
  } catch (err) {
    console.error("[messaging] unread count failed", err);
    res.status(500).json({ error: "Failed to load unread count" });
  }
});

/* ─────────────────── Get-or-create threads ─────────────────── */

/**
 * Insert-if-absent using the partial unique indexes, then read back. Two
 * people opening the same conversation at once both end up on one thread.
 */
async function getOrCreateThread(
  tenantId: number,
  where: { kind: "direct"; staffId: number } | { kind: "job"; workOrderId: number },
): Promise<ThreadRow> {
  const match = where.kind === "direct"
    ? and(
        eq(messageThreadsTable.tenantId, tenantId),
        eq(messageThreadsTable.kind, "direct"),
        eq(messageThreadsTable.staffId, where.staffId),
      )
    : and(
        eq(messageThreadsTable.tenantId, tenantId),
        eq(messageThreadsTable.kind, "job"),
        eq(messageThreadsTable.workOrderId, where.workOrderId),
      );

  const [existing] = await db.select().from(messageThreadsTable).where(match);
  if (existing) return existing;

  await db
    .insert(messageThreadsTable)
    .values(where.kind === "direct"
      ? { tenantId, kind: "direct", staffId: where.staffId }
      : { tenantId, kind: "job", workOrderId: where.workOrderId })
    .onConflictDoNothing();

  const [row] = await db.select().from(messageThreadsTable).where(match);
  if (!row) throw new Error("Failed to create conversation");
  return row;
}

/** POST /messaging/threads/direct/:staffId — office↔technician conversation. */
router.post("/messaging/threads/direct/:staffId", async (req, res) => {
  try {
    const auth = await authenticate(req as never, res);
    if (!auth) return;
    const { tenantId, staff } = auth;
    const targetId = parseInt(req.params["staffId"] ?? "", 10);
    if (!Number.isFinite(targetId)) { res.status(400).json({ error: "Invalid staff id" }); return; }

    // A technician may only open their own thread with the office.
    if (!isFsmAdmin(staff) && targetId !== staff.id) {
      res.status(403).json({ error: "You can only message the office" });
      return;
    }
    const [target] = await db
      .select({ id: staffTable.id, name: staffTable.name })
      .from(staffTable)
      .where(and(eq(staffTable.id, targetId), eq(staffTable.tenantId, tenantId)));
    if (!target) { res.status(404).json({ error: "Staff member not found" }); return; }

    const thread = await getOrCreateThread(tenantId, { kind: "direct", staffId: targetId });
    res.json({
      id: thread.id,
      kind: thread.kind,
      staffId: thread.staffId,
      title: isFsmAdmin(staff) ? target.name : "Office",
    });
  } catch (err) {
    console.error("[messaging] open direct thread failed", err);
    res.status(500).json({ error: "Failed to open conversation" });
  }
});

/** POST /messaging/threads/job/:workOrderId — office + everyone assigned to the job. */
router.post("/messaging/threads/job/:workOrderId", async (req, res) => {
  try {
    const auth = await authenticate(req as never, res);
    if (!auth) return;
    const { tenantId, staff } = auth;
    const woId = parseInt(req.params["workOrderId"] ?? "", 10);
    if (!Number.isFinite(woId)) { res.status(400).json({ error: "Invalid job id" }); return; }

    const [wo] = await db
      .select({ id: workOrdersTable.id, number: workOrdersTable.workOrderNumber })
      .from(workOrdersTable)
      .where(and(
        eq(workOrdersTable.id, woId),
        eq(workOrdersTable.tenantId, tenantId),
        isFsmAdmin(staff) ? sql`TRUE` : assignedToStaff(staff.id),
      ));
    if (!wo) { res.status(404).json({ error: "Job not found" }); return; }

    const thread = await getOrCreateThread(tenantId, { kind: "job", workOrderId: woId });
    res.json({ id: thread.id, kind: thread.kind, workOrderId: woId, title: `Job ${wo.number}` });
  } catch (err) {
    console.error("[messaging] open job thread failed", err);
    res.status(500).json({ error: "Failed to open conversation" });
  }
});

/* ───────────────────────── Messages ───────────────────────── */

const MESSAGE_PAGE = 100;

/**
 * GET /messaging/threads/:id/messages?afterId=
 * Without afterId: the most recent page, oldest-first. With afterId: only what
 * arrived since — this is what the open-thread poll uses.
 */
router.get("/messaging/threads/:id/messages", async (req, res) => {
  try {
    const ctx = await loadThread(req as never, res);
    if (!ctx) return;
    const { tenantId, staff, thread } = ctx;

    const afterRaw = req.query["afterId"];
    const afterId = afterRaw != null ? parseInt(String(afterRaw), 10) : NaN;

    const base = and(
      eq(threadMessagesTable.tenantId, tenantId),
      eq(threadMessagesTable.threadId, thread.id),
    );

    const rows = Number.isFinite(afterId)
      ? await db.select().from(threadMessagesTable)
          .where(and(base, gt(threadMessagesTable.id, afterId)))
          .orderBy(asc(threadMessagesTable.id))
          .limit(500)
      : (await db.select().from(threadMessagesTable)
          .where(base)
          .orderBy(desc(threadMessagesTable.id))
          .limit(MESSAGE_PAGE)).reverse();

    res.json({
      threadId: thread.id,
      kind: thread.kind,
      workOrderId: thread.workOrderId,
      side: sideOf(staff),
      staffId: staff.id,
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        senderStaffId: m.senderStaffId,
        senderName: m.senderName,
        senderSide: m.senderSide,
        mine: m.senderStaffId === staff.id,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    console.error("[messaging] load messages failed", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

const SendSchema = z.object({ body: z.string().trim().min(1).max(4000) });

/** POST /messaging/threads/:id/messages — send plain text. */
router.post("/messaging/threads/:id/messages", async (req, res) => {
  try {
    const ctx = await loadThread(req as never, res);
    if (!ctx) return;
    const { tenantId, staff, thread } = ctx;

    const parsed = SendSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Type a message first" }); return; }
    const body = parsed.data.body;
    const side = sideOf(staff);

    const message = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(threadMessagesTable)
        .values({
          tenantId,
          threadId: thread.id,
          body,
          senderStaffId: staff.id,
          senderName: staff.name,
          senderSide: side,
        })
        .returning();
      if (!m) throw new Error("Insert failed");

      // Two people can send at the same instant. Only let the newer message win
      // the denormalized preview, or a slower transaction carrying an older id
      // would overwrite it and push the thread back down the inbox.
      await tx
        .update(messageThreadsTable)
        .set({
          lastMessageId: m.id,
          lastMessageAt: m.createdAt,
          lastMessagePreview: preview(body),
          lastMessageSenderName: staff.name,
        })
        .where(and(
          eq(messageThreadsTable.id, thread.id),
          eq(messageThreadsTable.tenantId, tenantId),
          sql`(${messageThreadsTable.lastMessageId} IS NULL OR ${messageThreadsTable.lastMessageId} < ${m.id})`,
        ));

      // The sender has, by definition, read their own message.
      await tx
        .insert(threadReadsTable)
        .values({ tenantId, threadId: thread.id, staffId: staff.id, lastReadMessageId: m.id })
        .onConflictDoUpdate({
          target: [threadReadsTable.threadId, threadReadsTable.staffId],
          set: {
            lastReadMessageId: sql`GREATEST(${threadReadsTable.lastReadMessageId}, ${m.id})`,
            updatedAt: new Date(),
          },
        });
      return m;
    });

    res.status(201).json({
      id: message.id,
      body: message.body,
      senderStaffId: message.senderStaffId,
      senderName: message.senderName,
      senderSide: message.senderSide,
      mine: true,
      createdAt: message.createdAt,
    });
  } catch (err) {
    console.error("[messaging] send failed", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

const ReadSchema = z.object({ lastMessageId: z.number().int().nonnegative().optional() });

/** POST /messaging/threads/:id/read — advance my read cursor (never rewinds). */
router.post("/messaging/threads/:id/read", async (req, res) => {
  try {
    const ctx = await loadThread(req as never, res);
    if (!ctx) return;
    const { tenantId, staff, thread } = ctx;

    // Never trust the client's id blindly: message ids are global, so an id
    // from another thread would park this cursor in the future and silently
    // suppress unread counts here forever. Cap it at this thread's newest.
    const [newest] = await db
      .select({ id: sql<number>`COALESCE(MAX(${threadMessagesTable.id}), 0)` })
      .from(threadMessagesTable)
      .where(and(
        eq(threadMessagesTable.threadId, thread.id),
        eq(threadMessagesTable.tenantId, tenantId),
      ));
    const ceiling = Number(newest?.id ?? 0);

    const parsed = ReadSchema.safeParse(req.body ?? {});
    const requested = parsed.success && parsed.data.lastMessageId != null
      ? parsed.data.lastMessageId
      : ceiling;
    const upTo = Math.min(requested, ceiling);

    await db
      .insert(threadReadsTable)
      .values({ tenantId, threadId: thread.id, staffId: staff.id, lastReadMessageId: upTo })
      .onConflictDoUpdate({
        target: [threadReadsTable.threadId, threadReadsTable.staffId],
        // Out-of-order polls must not un-read older messages.
        set: {
          lastReadMessageId: sql`GREATEST(${threadReadsTable.lastReadMessageId}, ${upTo})`,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true, lastReadMessageId: upTo });
  } catch (err) {
    console.error("[messaging] mark read failed", err);
    res.status(500).json({ error: "Failed to update read state" });
  }
});

export default router;
