import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { workOrdersTable } from "./work-orders";

/**
 * In-app messaging for the Work Orders / FSM module.
 *
 * Two kinds of conversation:
 *  - "direct": one thread per technician. The office side is a COLLECTIVE
 *    identity — any admin/manager/owner can read and reply — so a message
 *    never sits unread because one person is off shift.
 *  - "job": one thread per work order, shared by the office and every
 *    technician currently assigned to that job. Access is derived live from
 *    the assignment, so unassigning a technician also removes their access.
 *
 * Text only: there is no attachment column by design.
 */
export const messageThreadsTable = pgTable(
  "message_threads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    /** "direct" | "job" */
    kind: text("kind").notNull(),
    /** Set for kind = "job". */
    workOrderId: integer("work_order_id").references(() => workOrdersTable.id, {
      onDelete: "cascade",
    }),
    /** Set for kind = "direct" — the technician on the other side of the office. */
    staffId: integer("staff_id"),
    /** Denormalised inbox preview, written in the same transaction as the message. */
    lastMessageId: integer("last_message_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    lastMessageSenderName: text("last_message_sender_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantRecentIdx: index("message_threads_tenant_recent_idx").on(t.tenantId, t.lastMessageAt),
    // One direct thread per technician, one job thread per work order — the
    // partial unique indexes are what make get-or-create race-safe.
    directUniq: uniqueIndex("message_threads_direct_unique")
      .on(t.tenantId, t.staffId)
      .where(sql`kind = 'direct'`),
    jobUniq: uniqueIndex("message_threads_job_unique")
      .on(t.tenantId, t.workOrderId)
      .where(sql`kind = 'job'`),
  }),
);

export const threadMessagesTable = pgTable(
  "thread_messages",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => messageThreadsTable.id, { onDelete: "cascade" }),
    /** Plain text. No media, by product decision. */
    body: text("body").notNull(),
    senderStaffId: integer("sender_staff_id"),
    /** Snapshot of the sender's name at send time, so renames don't rewrite history. */
    senderName: text("sender_name").notNull(),
    /** "office" | "technician" — derived server-side from the sender's role. */
    senderSide: text("sender_side").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadIdx: index("thread_messages_thread_idx").on(t.tenantId, t.threadId, t.id),
  }),
);

/** Per-person read cursor. Office staff each get their own row. */
export const threadReadsTable = pgTable(
  "thread_reads",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => messageThreadsTable.id, { onDelete: "cascade" }),
    staffId: integer("staff_id").notNull(),
    lastReadMessageId: integer("last_read_message_id").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    threadStaffUniq: uniqueIndex("thread_reads_thread_staff_unique").on(t.threadId, t.staffId),
  }),
);

export type MessageThread = typeof messageThreadsTable.$inferSelect;
export type ThreadMessage = typeof threadMessagesTable.$inferSelect;
export type ThreadRead = typeof threadReadsTable.$inferSelect;
