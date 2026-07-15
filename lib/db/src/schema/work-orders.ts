import { pgTable, text, serial, timestamp, real, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { staffTable } from "./staff";

// Work orders: repair/service jobs with parts + labor lines, a status
// lifecycle (received → in_progress → ready → collected), and staff
// assignment. A work order never touches stock or accounting itself —
// converting it to a sale loads its lines into the POS cart (quotation
// pattern) and the real checkout does stock deduction and the JE.
export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  workOrderNumber: text("work_order_number").notNull(),
  customerId: integer("customer_id").references(() => customersTable.id),
  // Walk-in fallback when no customer record is linked.
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  // What was brought in and what's wrong with it.
  itemDescription: text("item_description").notNull(),
  problemDescription: text("problem_description").notNull(),
  diagnosis: text("diagnosis"),
  assignedStaffId: integer("assigned_staff_id").references(() => staffTable.id),
  // Parts come from the catalog (productId set); labor/service lines are
  // free-form (type "labor", no productId).
  items: jsonb("items").notNull().$type<Array<{
    type: "part" | "labor";
    productId?: number;
    description: string;
    price: number;
    quantity: number;
    isTaxable?: boolean;
  }>>(),
  subtotal: real("subtotal").notNull().default(0),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  // received | in_progress | ready | collected | cancelled
  status: text("status").notNull().default("received"),
  promisedDate: timestamp("promised_date", { withTimezone: true }),
  notes: text("notes"),
  // Set when the work order is checked out as a sale.
  convertedOrderId: integer("converted_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantWorkOrderNumberUnique: uniqueIndex("work_orders_tenant_number_unique").on(
    t.tenantId,
    t.workOrderNumber,
  ),
  tenantStatusIdx: index("work_orders_tenant_status_idx").on(t.tenantId, t.status),
}));

export type WorkOrder = typeof workOrdersTable.$inferSelect;
