import { sql } from "drizzle-orm";
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
  // When a whole technician team is assigned to the job (in addition to
  // expanding its members into assignedStaffIds). Nullable.
  assignedTeamId: integer("assigned_team_id"),

  // Universal installation form: dispatcher-selected service areas gate which
  // dynamic sections the technician sees; answers live in install_details JSONB
  // keyed by sectionId → fieldId (tables are arrays of row objects).
  serviceAreas: jsonb("service_areas").notNull().$type<string[]>().default([]),
  installDetails: jsonb("install_details").notNull().$type<Record<string, Record<string, unknown>>>().default({}),
  // FSM technician acceptance flow: pending → accepted | declined.
  // Reset to 'pending' whenever the assigned staff changes.
  assignmentStatus: text("assignment_status").notNull().default("pending"), // pending | accepted | declined
  assignmentRespondedAt: timestamp("assignment_responded_at", { withTimezone: true }),
  declineReason: text("decline_reason"),
  // FSM field execution timeline: Start Travel → Arrive (work clock starts) → Complete Work.
  travelStartedAt: timestamp("travel_started_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  workCompletedAt: timestamp("work_completed_at", { withTimezone: true }),
  // Expected job duration in minutes — shown next to the live clock so the
  // technician can see time remaining / overrun.
  estimatedMinutes: integer("estimated_minutes"),
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

  // Customer sign-off captured by the FSM technician at work completion
  // (SVG/PNG data URL; separate from the collection signatures above)
  completionSignature: text("completion_signature"),
  completionSignedBy: text("completion_signed_by"),
  completionSignedAt: timestamp("completion_signed_at", { withTimezone: true }),
  // How completion was verified: "signature" (drawn) or "otp" (emailed code).
  // When "otp", completionSignature holds the sentinel "otp-verified".
  completionVerifiedVia: text("completion_verified_via"),
  // One-time code the customer receives by email to confirm completion
  // when they can't / don't want to sign. Stored hashed.
  completionOtpHash: text("completion_otp_hash"),
  completionOtpExpiresAt: timestamp("completion_otp_expires_at", { withTimezone: true }),
  completionOtpAttempts: integer("completion_otp_attempts").notNull().default(0),
  // Manager override code required for "Complete Without Signature": the
  // technician calls the office, a manager generates the code and reads it
  // out. Stored hashed, short-lived.
  managerCodeHash: text("manager_code_hash"),
  managerCodeExpiresAt: timestamp("manager_code_expires_at", { withTimezone: true }),
  managerCodeAttempts: integer("manager_code_attempts").notNull().default(0),
  // Guard so the post-completion review request is only emailed once.
  reviewEmailSentAt: timestamp("review_email_sent_at", { withTimezone: true }),
  /** Atomic claim: set once when the signed-completion email is dispatched, so
   * the complete transition and the sign-off/OTP routes can all safely attempt
   * the send without racing or duplicating. */
  completionEmailSentAt: timestamp("completion_email_sent_at", { withTimezone: true }),
  /** Atomic claim: set once when product-linked installation-form equipment
   * rows have been deducted from inventory (at FSM completion or POS
   * collection, whichever happens first). */
  equipmentDeductedAt: timestamp("equipment_deducted_at", { withTimezone: true }),

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

// ─── Work Order Time Entries ──────────────────────────────────────────────────
// FSM field time tracking. A 'work' entry is opened when the technician arrives
// on site and closed on pause/complete; 'break'/'waiting' entries record paused
// time (non-billable). `minutes` is finalised when the entry is closed.
export const workOrderTimeEntriesTable = pgTable("work_order_time_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  staffName: text("staff_name"), // denormalised for deleted staff
  entryType: text("entry_type").notNull().default("work"), // work | break | waiting
  pauseReason: text("pause_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  minutes: integer("minutes"),
  isBillable: boolean("is_billable").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_time_entries_wo_idx").on(t.tenantId, t.workOrderId),
  // At most ONE open (ended_at IS NULL) entry per work order — the FSM
  // pause/resume/complete state machine depends on this invariant.
  oneOpenUniq: uniqueIndex("work_order_time_entries_one_open_uniq")
    .on(t.tenantId, t.workOrderId)
    .where(sql`${t.endedAt} IS NULL`),
}));

export type WorkOrderTimeEntry = typeof workOrderTimeEntriesTable.$inferSelect;

// ─── Work Order Photos ────────────────────────────────────────────────────────
// Proof-of-work photos captured by FSM technicians in the field.
// `data` is a compressed JPEG data URL (base64) — same inline pattern used for
// signatures and subscription proofs elsewhere in the app.
export const workOrderPhotosTable = pgTable("work_order_photos", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  staffName: text("staff_name"),
  data: text("data").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_photos_wo_idx").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderPhoto = typeof workOrderPhotosTable.$inferSelect;

// ─── Work Order Material / Cable Allocations ─────────────────────────────────
// Dispatch-slip model: office allocates materials (optionally linked to an
// inventory product — allocation deducts stock, returns restore it) to a work
// order; technicians log usage in the field. Cable allocations additionally
// carry a per-run log (camera/label, port, start/end footage) in `runs` JSONB.
export const workOrderAllocationsTable = pgTable("work_order_allocations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id"), // nullable: free-text / purchased-on-site items
  // Links this line to a specific tracked tool in the fixed-asset register.
  // Set when a registered tool goes out on the job; returning the line hands
  // custody back, so per-job custody and the asset ledger stay in step.
  assetId: integer("asset_id"),
  description: text("description").notNull(),
  category: text("category"), // e.g. PVC, TRK, ADH, TOOL, CABLE
  unit: text("unit").notNull().default("pcs"), // pcs | length | ft | box | tin | pc …
  qtyAllocated: real("qty_allocated").notNull(),
  qtyReturned: real("qty_returned").notNull().default(0),
  // tool | consumable: tools are expected back; consumables are used up
  isReturnable: boolean("is_returnable").notNull().default(false),
  // Cable-specific: box size in feet + per-run usage log
  isCable: boolean("is_cable").notNull().default(false),
  boxSizeFt: real("box_size_ft"),
  runs: jsonb("runs").notNull().$type<Array<{
    label: string;        // camera ID / run label e.g. CAM-01
    location?: string;    // location / label
    port?: string;        // NVR / switch port
    startFt?: number | null;
    endFt?: number | null;
    lengthFt?: number | null; // derived: endFt - startFt (stored for reporting)
    tested?: boolean | null;
    remarks?: string;
  }>>().default([]),
  status: text("status").notNull().default("dispatched"), // dispatched | returned
  dispatchedByStaffId: integer("dispatched_by_staff_id").references(() => staffTable.id),
  dispatchedByName: text("dispatched_by_name"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_allocations_wo_idx").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderAllocation = typeof workOrderAllocationsTable.$inferSelect;
export type CableRun = NonNullable<WorkOrderAllocation["runs"]>[number];

// ─── Work Order Material / Tool Return Handovers ─────────────────────────────
// Mirrors the cash-handover custody model for physical items: after a job the
// technician declares what they are bringing back (a pending row — nothing
// moves in inventory yet), then hands the phone to a manager / supervisor /
// authorised receiver who picks their name, enters their PIN and signs. Only
// that signature applies the returns to `work_order_allocations.qty_returned`
// and restores stock, so a technician can never clear their own custody.
export const workOrderMaterialHandoversTable = pgTable("work_order_material_handovers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  // Technician returning the items.
  staffId: integer("staff_id"),
  staffName: text("staff_name").notNull(),
  status: text("status").notNull().default("pending"), // pending | signed | cancelled
  // Declared lines. qtyReturned is what the technician says they are handing
  // back; qtyAccepted is what actually got applied at signing time (capped at
  // the outstanding balance, so a concurrent office return can't double-count).
  items: jsonb("items").notNull().$type<Array<{
    allocationId: number;
    description: string;
    unit: string;
    isReturnable: boolean;
    qtyOutstanding: number;
    qtyReturned: number;
    qtyAccepted?: number;
    remarks?: string;
  }>>().default([]),
  notes: text("notes"),
  // Receiver (manager / supervisor / authorised person)
  receivedByStaffId: integer("received_by_staff_id"),
  receivedByName: text("received_by_name"),
  receivedNotes: text("received_notes"),
  signature: text("signature"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("wo_material_handovers_wo_idx").on(t.tenantId, t.workOrderId),
  staffIdx: index("wo_material_handovers_staff_idx").on(t.tenantId, t.staffId, t.status),
  // At most one return can be waiting for a signature per job — the declare
  // endpoint relies on this to turn a race into a clean 409.
  onePending: uniqueIndex("wo_material_handovers_one_pending")
    .on(t.tenantId, t.workOrderId)
    .where(sql`status = 'pending'`),
}));

export type WorkOrderMaterialHandover = typeof workOrderMaterialHandoversTable.$inferSelect;
export type MaterialHandoverItem = WorkOrderMaterialHandover["items"][number];

// ─── Work Order Appointments ──────────────────────────────────────────────────
export const workOrderAppointmentsTable = pgTable("work_order_appointments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staffTable.id),
  // Full technician team for this visit (staffId keeps the primary tech for
  // backwards compatibility).
  staffIds: jsonb("staff_ids").$type<number[]>(),
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

// ─── Work Order Reviews ───────────────────────────────────────────────────────
// Customer rating collected after job completion via the public portal link.
export const workOrderReviewsTable = pgTable("work_order_reviews", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  reviewerName: text("reviewer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woUniq: uniqueIndex("work_order_reviews_wo_unique").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderReview = typeof workOrderReviewsTable.$inferSelect;

// ─── Work Order Manager Reviews ──────────────────────────────────────────────
// Internal QA: management rates how well the job itself was executed
// (distinct from the customer's public review). One per work order,
// editable by managerial staff; created/updated audit fields kept.
export const workOrderManagerReviewsTable = pgTable("work_order_manager_reviews", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(), // 1-5 stars
  outcome: text("outcome").notNull().default("satisfactory"), // satisfactory | needs_improvement | unsatisfactory
  comment: text("comment"),
  reviewerStaffId: integer("reviewer_staff_id"),
  reviewerName: text("reviewer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woUniq: uniqueIndex("work_order_manager_reviews_wo_unique").on(t.tenantId, t.workOrderId),
}));

export type WorkOrderManagerReview = typeof workOrderManagerReviewsTable.$inferSelect;

// ─── Work Order Payments ──────────────────────────────────────────────────────
// Onsite money collection ledger (technicians in the field or office staff).
// Cash rows feed the collector's cash-session expected-cash calculation (scoped
// by staffId + createdAt window, same pattern as layaway payments).
export const workOrderPaymentsTable = pgTable("work_order_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  workOrderId: integer("work_order_id").notNull().references(() => workOrdersTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  amount: real("amount").notNull(),
  method: text("method").notNull(), // cash | card | transfer
  reference: text("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  woIdx: index("work_order_payments_wo_idx").on(t.tenantId, t.workOrderId),
  staffTimeIdx: index("work_order_payments_staff_time_idx").on(t.tenantId, t.staffId, t.createdAt),
}));

export type WorkOrderPayment = typeof workOrderPaymentsTable.$inferSelect;
