import { Router, type IRouter } from "express";
import { eq, like, and, type SQL } from "drizzle-orm";
import { db, customersTable, ordersTable, orderItemsTable } from "@workspace/db";
import { sendTemplateEmail } from "./email-templates";
import { getSetting } from "./settings";
import {
  ListCustomersQueryParams,
  ListCustomersResponse,
  CreateCustomerBody,
  GetCustomerParams,
  GetCustomerResponse,
  UpdateCustomerParams,
  UpdateCustomerResponse,
  DeleteCustomerParams,
  GetCustomerOrdersParams,
  GetCustomerOrdersResponse,
} from "@workspace/api-zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function normalizeCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

router.get("/customers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListCustomersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [eq(customersTable.tenantId, tenantId)];
  if (query.data.search) {
    conditions.push(like(customersTable.name, `%${query.data.search}%`));
  }

  const customers = await db.select().from(customersTable).where(and(...conditions));
  res.json(ListCustomersResponse.parse(customers.map(normalizeCustomer)));
});

router.post("/customers", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db
    .insert(customersTable)
    .values({
      tenantId,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })
    .returning();

  if (customer?.email) {
    const businessName = (await getSetting("business_name", tenantId)) ?? "NEXXUS POS";
    sendTemplateEmail({
      tenantId,
      templateKey: "welcome",
      to: customer.email,
      vars: {
        business_name: businessName,
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone ?? "",
      },
    }).catch(() => {});
  }

  res.status(201).json(GetCustomerResponse.parse(normalizeCustomer(customer)));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCustomerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.tenantId, tenantId)));

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(GetCustomerResponse.parse(normalizeCustomer(customer)));
});

router.put("/customers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateCustomerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db
    .update(customersTable)
    .set({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.tenantId, tenantId)))
    .returning();

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(UpdateCustomerResponse.parse(normalizeCustomer(customer)));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteCustomerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db
    .delete(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.tenantId, tenantId)))
    .returning();

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/customers/:id/orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCustomerOrdersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.id, params.data.id), eq(customersTable.tenantId, tenantId)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, params.data.id), eq(ordersTable.tenantId, tenantId)));

  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return {
        ...order,
        discountType: order.discountType ?? undefined,
        discountAmount: order.discountAmount ?? undefined,
        discountValue: order.discountValue ?? undefined,
        paymentMethod: order.paymentMethod ?? undefined,
        splitCardAmount: order.splitCardAmount ?? undefined,
        splitCashAmount: order.splitCashAmount ?? undefined,
        notes: order.notes ?? undefined,
        voidReason: order.voidReason ?? undefined,
        customerId: order.customerId ?? undefined,
        completedAt: order.completedAt ?? undefined,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount ?? undefined,
          lineTotal: item.lineTotal,
        })),
      };
    }),
  );

  res.json(GetCustomerOrdersResponse.parse(ordersWithItems));
});

export default router;
