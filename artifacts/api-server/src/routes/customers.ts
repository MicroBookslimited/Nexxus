import { Router, type IRouter } from "express";
import { eq, like, and, type SQL } from "drizzle-orm";
import { db, customersTable, ordersTable, orderItemsTable } from "@workspace/db";
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

const router: IRouter = Router();

function normalizeCustomer(c: typeof customersTable.$inferSelect) {
  return {
    ...c,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

router.get("/customers", async (req, res): Promise<void> => {
  const query = ListCustomersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions: SQL[] = [];
  if (query.data.search) {
    conditions.push(like(customersTable.name, `%${query.data.search}%`));
  }

  const customers =
    conditions.length > 0
      ? await db.select().from(customersTable).where(and(...conditions))
      : await db.select().from(customersTable);

  res.json(ListCustomersResponse.parse(customers.map(normalizeCustomer)));
});

router.post("/customers", async (req, res): Promise<void> => {
  const parsed = CreateCustomerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [customer] = await db
    .insert(customersTable)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    })
    .returning();

  res.status(201).json(GetCustomerResponse.parse(normalizeCustomer(customer)));
});

router.get("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCustomerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, params.data.id));

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(GetCustomerResponse.parse(normalizeCustomer(customer)));
});

router.put("/customers/:id", async (req, res): Promise<void> => {
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
    .where(eq(customersTable.id, params.data.id))
    .returning();

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.json(UpdateCustomerResponse.parse(normalizeCustomer(customer)));
});

router.delete("/customers/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteCustomerParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [customer] = await db
    .delete(customersTable)
    .where(eq(customersTable.id, params.data.id))
    .returning();

  if (!customer) {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/customers/:id/orders", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCustomerOrdersParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.customerId, params.data.id));

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
