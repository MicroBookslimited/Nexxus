import { pgTable, serial, text, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Guided support tickets submitted from the in-app Support section. Each row is
 * a client-raised ticket (or a self-resolved FAQ hit) scoped to a tenant. Ticket
 * isolation is enforced at the API layer via the tenant JWT — the same model the
 * rest of the app uses — not Postgres RLS.
 */
export const supportTicketsTable = pgTable("support_tickets", {
  id: serial("id").primaryKey(),
  ticketRef: text("ticket_ref").notNull().unique(),
  tenantId: integer("tenant_id").notNull(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  category: text("category").notNull(),
  subCategory: text("sub_category").notNull(),
  impact: text("impact"),
  priority: text("priority").notNull().default("NORMAL"),
  startedWhen: text("started_when"),
  stepsTaken: jsonb("steps_taken"),
  additionalNotes: text("additional_notes"),
  /** 'self_resolved' when the user fixed it via the smart FAQ; null for a real ticket. */
  resolutionType: text("resolution_type"),
  /** How the report reached us (Whatsapp, Email, Phone, SMS, Office Visit, Client Visit, Other); null for in-app tickets. */
  reportSource: text("report_source"),
  status: text("status").notNull().default("open"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("support_tickets_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("support_tickets_status_idx").on(t.status),
]);

export type SupportTicket = typeof supportTicketsTable.$inferSelect;
