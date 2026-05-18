import { pgTable, serial, integer, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { purchaseBillsTable, purchaseBillItemsTable } from "./restaurant";
import { productBatchesTable } from "./product-batches";

/**
 * Supplier Return / Debit Note.
 *
 * Inverse of a purchase bill — used when goods are returned to a supplier
 * (damaged, wrong item, over-ordered, etc.). Reduces stock and posts a
 * reversing journal entry (Dr AP, Cr Inventory, Cr Input Tax).
 *
 * Two flavours:
 *   - bill-linked: `purchaseBillId` is set; lines reference specific
 *     `purchaseBillItemId`s and per-product return qty is capped at the
 *     original receive qty minus any prior returns against the same line.
 *   - standalone: `purchaseBillId` is null; user enters product + qty +
 *     unit cost freely. Used for ad-hoc returns (no original bill on file).
 */
export const supplierReturnsTable = pgTable("supplier_returns", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  returnNumber: text("return_number").notNull(),
  supplier: text("supplier"),
  // null => standalone debit note
  purchaseBillId: integer("purchase_bill_id").references(() => purchaseBillsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),       // draft | confirmed | cancelled
  notes: text("notes"),
  // Sum of (qty * unitCost) across all lines, BEFORE tax.
  subtotal: real("subtotal").notNull().default(0),
  // Sum of input tax to reverse across all lines.
  taxTotal: real("tax_total").notNull().default(0),
  // Grand total = subtotal + taxTotal. Posted as the AP debit.
  totalAmount: real("total_amount").notNull().default(0),
  returnDate: timestamp("return_date", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("supplier_returns_tenant_idx").on(t.tenantId, t.status),
  billIdx: index("supplier_returns_bill_idx").on(t.purchaseBillId),
}));

export type SupplierReturn = typeof supplierReturnsTable.$inferSelect;

export const supplierReturnItemsTable = pgTable("supplier_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => supplierReturnsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  // null for standalone returns; otherwise the original bill line being
  // returned. Used to cap qty against the original receive qty.
  purchaseBillItemId: integer("purchase_bill_item_id").references(() => purchaseBillItemsTable.id, { onDelete: "set null" }),
  quantity: integer("quantity").notNull(),
  // Per-unit cost EXCLUDING tax. For bill-linked: copied from bill line.
  unitCost: real("unit_cost").notNull().default(0),
  // Tax rate (%) for this line. For bill-linked: copied from bill line.
  taxRate: real("tax_rate"),
  taxAmount: real("tax_amount").notNull().default(0),
  totalAmount: real("total_amount").notNull().default(0),
  // For batch-tracked products: which lot the user chose to return from.
  // Null when the product doesn't track batches.
  batchId: integer("batch_id").references(() => productBatchesTable.id, { onDelete: "set null" }),
  notes: text("notes"),
});

export type SupplierReturnItem = typeof supplierReturnItemsTable.$inferSelect;
