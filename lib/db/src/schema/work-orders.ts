import {
  pgTable, text, serial, timestamp, real, integer, boolean,
  jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { staffTable } from "./staff";

// ─── Work Orders ─────────────────────────────────────────────────────────────
// Core record. A work order tracks a service job from intake through completion.
// Parts & labour live in JSONB items for Phase 1 simplicity; status transitions
// are enforced server-side; the job can be converted to a POS sale at checkout.
export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  workOrderNumber: text("work_order_number").notNull(),

  // Customer
  customerId: integer("customer_id").references(() => customersTable.id),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),

  // Asset / item being serviced
  itemDescription: text("item_description").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  imei: text("imei"),
  assetTag: text("asset_tag"),
  colour: text("colour"),
  conditionReceived: text("condition_received"), // e.g. "Good", "Scratched", "Cracked screen"
  accessoriesReceived: text("accessories_received"), // comma-sep or free text

  // Problem
  problemDescription: text("problem_description").notNull(),
  diagnosis: text("diagnosis"),

  // Service metadata
  serviceType: text("service_type"),   // e.g. "Repair", "Installation", "Maintenance"
  serviceChannel: text("service_channel").notNull().default("in_store"), // in_store | on_site | pickup | delivery | remote
  priority: text("priority").notNull().default("normal"), // low | normal | high | urgent | emergency

  // Assignment & scheduling — assignedStaffId is kept as the "primary" for backward-compat joins.
  // assignedStaffIds is the full ordered list (used by the multi-technician UI).
  assignedStaffId: integer("assigned_staff_id").references(() => staffTable.id),
  assignedStaffIds: jsonb("assigned_staff_ids").notNull().$type<number[]>().default([]),
  // FSM technician acceptance flow: pending → accepted | declined.
  // Reset to 'pending' whenever the assigned staff changes.
  assignmentStatus: text("assignment_status").notNull().default("pending"), // pending | accepted | declined
  assignmentRespondedAt: timestamp("assignment_responded_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  promisedDate: timestamp("promised_date", { withTimezone: true }),
  appointmentDate: timestamp("appointment_date", { withTimezone: true }),
  storageLocation: text("storage_location"),

  // Financials — parts & labour stored as JSONB line items
  items: jsonb("items").notNull().$type<Array<{
    type: "part" | "labor" | "fee";
    productId?: number;
    description: string;
    price: number;
    quantity: number;
    isTaxable?: boolean;
    costPrice?: number; // for profitability
  }>>(),
  subtotal: real("subtotal").notNull().default(0),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),

  // Deposits
  depositRequired: real("deposit_required"),
  depositPaid: real("deposit_paid").notNull().default(0),

  // Status lifecycle
  // received | in_progress | awaiting_parts | on_hold | ready | invoiced | paid | collected | cancelled
  status: text("status").notNull().default("received"),

  // Internal notes (top-level; per-message notes in work_order_notes)
  notes: text("notes"),
  internalNotes: text("internal_notes"),

  // Set when checked out as a POS sale
  convertedOrderId: integer("converted_order_id"),

  // Digital signatures captured at collection (base64 PNG data URLs)
  customerSignature: text("customer_signature"),
  staffSignature: text("staff_signature"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantWoNumberUniq: uniqueIndex("work_orders_tenant_number_unique").on(t.tenantId, t.workOrderNumber),
  tenantStatusIdx: index("work_orders_tenant_status_idx").on(t.tenantId, t.status),
  tenantCreatedIdx: index("work_orders_tenant_created_idx").on(t.tenantId, t.createdAt),
  serialIdx: index("work_orders_serial_idx").on(t.tenantId, t.serialNumber),
}));

export type WorkOrder = typeof workOrdersTable.$inferSelect;
export type WorkOrderItem = NonNullable<WorkOrder["items"]>[number];

// ─── Work Order Notes ─────────────────────────────────────────────────────────
// Per-note audit trail. Internal notes hidden from customer portal.
export const workOrderNotesTable = pgTable("work_order_notes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  authorStaffId: integer("author_staff_id").references(() => staffTable.id),
  authorName: text("author_name"), // denormalised for deleted staff
  content: text("content").notNull(),
  isInternal: boolean("is_internal").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_notes_wo_idx").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderNote = typeof workOrderNotesTable.$inferSelect;

// ─── Work Order Status History ────────────────────────────────────────────────
export const workOrderStatusHistoryTable = pgTable("work_order_status_history", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedByStaffId: integer("changed_by_staff_id").references(() => staffTable.id),
  changedByName: text("changed_by_name"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_status_history_wo_idx").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderStatusHistory = typeof workOrderStatusHistoryTable.$inferSelect;

// ─── Work Order Appointments ──────────────────────────────────────────────────
export const workOrderAppointmentsTable = pgTable("work_order_appointments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  appointmentType: text("appointment_type").notNull().default("repair"),
  // assessment | repair | installation | site_visit | pickup | delivery | follow_up
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }),
  notes: text("notes"),
  status: text("status").notNull().default("scheduled"),
  // scheduled | confirmed | in_progress | completed | cancelled | no_show
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_appt_wo_idx").on(t.tenantId, t.workOrderId),
  timeIdx: index("work_order_appt_time_idx").on(t.tenantId, t.startTime),
}));

export type WorkOrderAppointment = typeof workOrderAppointmentsTable.$inferSelect;
