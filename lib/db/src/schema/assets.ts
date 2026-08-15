import { sql } from "drizzle-orm";
import {
  pgTable, text, serial, timestamp, real, integer, boolean,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

// ─── Technician Teams ────────────────────────────────────────────────────────
// A named crew with one leader. Teams can own tools (asset custody) and can be
// assigned to a work order in a single pick — assigning a team expands its
// members into the work order's assignedStaffIds so every existing visibility,
// dispatch and messaging rule keeps working unchanged.
export const technicianTeamsTable = pgTable("technician_teams", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  // The leader gets office-style rights over their team's jobs in the FSM app.
  leaderStaffId: integer("leader_staff_id").references(() => staffTable.id),
  colour: text("colour"), // optional badge colour for the calendar / kanban
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameUnique: uniqueIndex("technician_teams_tenant_name_unique").on(t.tenantId, t.name),
  tenantIdx: index("technician_teams_tenant_idx").on(t.tenantId, t.isActive),
}));

export type TechnicianTeam = typeof technicianTeamsTable.$inferSelect;

export const technicianTeamMembersTable = pgTable("technician_team_members", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  teamId: integer("team_id").notNull().references(() => technicianTeamsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  memberUnique: uniqueIndex("technician_team_members_unique").on(t.teamId, t.staffId),
  staffIdx: index("technician_team_members_staff_idx").on(t.tenantId, t.staffId),
}));

export type TechnicianTeamMember = typeof technicianTeamMembersTable.$inferSelect;

// ─── Fixed Assets ────────────────────────────────────────────────────────────
// The asset register: owned equipment tracked by tag, with straight-line
// depreciation (book value is computed on read, never stored — see the assets
// route) and an optional service/calibration schedule.
//
// `isTool = true` is what promotes an asset into the FSM tools catalog, where
// it can be given to a technician or a team. Custody itself lives in
// asset_assignments; `status` / `currentAssignmentId` are denormalised
// pointers kept in step inside the same transaction as the assignment.
export const fixedAssetsTable = pgTable("fixed_assets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),

  // Identity
  assetTag: text("asset_tag").notNull(),   // scannable/printed tag, unique per tenant
  barcode: text("barcode"),                // pre-existing manufacturer/company label, if any
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),              // Ladders, Power tools, Vehicles, IT …
  isTool: boolean("is_tool").notNull().default(false),

  serialNumber: text("serial_number"),
  manufacturer: text("manufacturer"),
  model: text("model"),
  photoUrl: text("photo_url"),

  // Purchase & warranty
  purchaseDate: timestamp("purchase_date", { withTimezone: true }),
  purchaseCost: real("purchase_cost").notNull().default(0),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name"),
  warrantyExpiry: timestamp("warranty_expiry", { withTimezone: true }),

  // Straight-line depreciation inputs. Book value = cost − accumulated, where
  // accumulated = min(monthsElapsed, usefulLifeMonths) × (cost − salvage)/life.
  depreciationMethod: text("depreciation_method").notNull().default("straight_line"), // straight_line | none
  usefulLifeMonths: integer("useful_life_months"),
  salvageValue: real("salvage_value").notNull().default(0),
  depreciationStartDate: timestamp("depreciation_start_date", { withTimezone: true }),

  // Condition & whereabouts
  condition: text("condition").notNull().default("good"),  // good | fair | needs_repair | out_of_service
  status: text("status").notNull().default("in_store"),    // in_store | assigned | in_repair | retired | lost
  locationId: integer("location_id"),
  locationName: text("location_name"),

  // Service / calibration schedule
  serviceIntervalDays: integer("service_interval_days"),
  lastServiceDate: timestamp("last_service_date", { withTimezone: true }),
  nextServiceDue: timestamp("next_service_due", { withTimezone: true }),

  // Denormalised pointer to the open asset_assignments row (null when in store).
  currentAssignmentId: integer("current_assignment_id"),

  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tagUnique: uniqueIndex("fixed_assets_tenant_tag_unique").on(t.tenantId, t.assetTag),
  toolIdx: index("fixed_assets_tenant_tool_idx").on(t.tenantId, t.isTool, t.status),
  serviceIdx: index("fixed_assets_service_due_idx").on(t.tenantId, t.nextServiceDue),
}));

export type FixedAsset = typeof fixedAssetsTable.$inferSelect;

// ─── Asset Assignments (custody ledger) ──────────────────────────────────────
// One row per custody spell. The partial unique index is load-bearing: it is
// what makes "an asset can only be in one person's hands at a time" safe under
// concurrent assignment, instead of relying on a read-then-write check.
export const assetAssignmentsTable = pgTable("asset_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  assetId: integer("asset_id").notNull().references(() => fixedAssetsTable.id, { onDelete: "cascade" }),

  assigneeType: text("assignee_type").notNull(), // staff | team
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  teamId: integer("team_id"),
  teamName: text("team_name"),

  // Set when the tool goes out on a specific job, so per-job custody and
  // long-term custody share one history.
  workOrderId: integer("work_order_id"),
  workOrderNumber: text("work_order_number"),

  assignedByStaffId: integer("assigned_by_staff_id"),
  assignedByName: text("assigned_by_name"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  expectedReturnDate: timestamp("expected_return_date", { withTimezone: true }),
  conditionOut: text("condition_out"),
  notes: text("notes"),

  status: text("status").notNull().default("active"), // active | returned
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnedToStaffId: integer("returned_to_staff_id"),
  returnedToName: text("returned_to_name"),
  conditionIn: text("condition_in"),
  returnNotes: text("return_notes"),
}, (t) => ({
  oneActive: uniqueIndex("asset_assignments_one_active")
    .on(t.assetId)
    .where(sql`status = 'active'`),
  assetIdx: index("asset_assignments_asset_idx").on(t.tenantId, t.assetId, t.assignedAt),
  staffIdx: index("asset_assignments_staff_idx").on(t.tenantId, t.staffId, t.status),
  teamIdx: index("asset_assignments_team_idx").on(t.tenantId, t.teamId, t.status),
}));

export type AssetAssignment = typeof assetAssignmentsTable.$inferSelect;

// ─── Asset Service Records ───────────────────────────────────────────────────
// Service / calibration / repair log. Logging a service rolls the asset's
// lastServiceDate and nextServiceDue forward.
export const assetServiceRecordsTable = pgTable("asset_service_records", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  assetId: integer("asset_id").notNull().references(() => fixedAssetsTable.id, { onDelete: "cascade" }),
  serviceType: text("service_type").notNull().default("service"), // service | calibration | repair | inspection
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  performedBy: text("performed_by"),
  cost: real("cost").notNull().default(0),
  notes: text("notes"),
  nextDueDate: timestamp("next_due_date", { withTimezone: true }),
  createdByStaffId: integer("created_by_staff_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  assetIdx: index("asset_service_records_asset_idx").on(t.tenantId, t.assetId, t.performedAt),
}));

export type AssetServiceRecord = typeof assetServiceRecordsTable.$inferSelect;
