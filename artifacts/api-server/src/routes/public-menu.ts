import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, tenantsTable, productsTable, ordersTable, orderItemsTable, variantGroupsTable, variantOptionsTable, modifierGroupsTable, modifierOptionsTable, appSettingsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

async function getTenantBySlug(slug: string): Promise<number | null> {
  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.slug, slug));
  return tenant?.id ?? null;
}

async function getAllSettingsForTenant(tenantId: number): Promise<Record<string, string>> {
  const DEFAULTS: Record<string, string> = {
    business_name: "NEXXUS POS",
    business_address: "",
    business_phone: "",
    tax_rate: "15",
    receipt_footer: "Thank you for your business!",
    base_currency: "JMD",
    secondary_currency: "",
    currency_rate: "0",
  };
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.tenantId, tenantId));
  const map: Record<string, string> = { ...DEFAULTS };
  const prefix = `${tenantId}:`;
  for (const row of rows) {
    const originalKey = row.key.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
    map[originalKey] = row.value;
  }
  return map;
}

router.get("/public/menu/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const tenantId = await getTenantBySlug(slug);
  if (!tenantId) { res.status(404).json({ error: "Business not found" }); return; }

  const products = await db.select().from(productsTable).where(
    and(eq(productsTable.tenantId, tenantId), eq(productsTable.inStock, true))
  );

  const enriched = await Promise.all(products.map(async (p) => {
    const variantGroups = await db.select().from(variantGroupsTable).where(eq(variantGroupsTable.productId, p.id));
    const modifierGroups = await db.select().from(modifierGroupsTable).where(eq(modifierGroupsTable.productId, p.id));

    const variantsWithOptions = await Promise.all(variantGroups.map(async (vg) => {
      const options = await db.select().from(variantOptionsTable).where(eq(variantOptionsTable.groupId, vg.id));
      return { id: vg.id, name: vg.name, isRequired: vg.required, options: options.map(o => ({ id: o.id, name: o.name, priceAdjustment: o.priceAdjustment })) };
    }));

    const modifiersWithOptions = await Promise.all(modifierGroups.map(async (mg) => {
      const options = await db.select().from(modifierOptionsTable).where(eq(modifierOptionsTable.groupId, mg.id));
      return { id: mg.id, name: mg.name, isMultiSelect: (mg.maxSelections ?? 1) !== 1, options: options.map(o => ({ id: o.id, name: o.name, priceAdjustment: o.priceAdjustment })) };
    }));

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      category: p.category,
      imageUrl: p.imageUrl,
      isAvailable: p.inStock,
      variantGroups: variantsWithOptions,
      modifierGroups: modifiersWithOptions,
    };
  }));

  const categories = [...new Set(enriched.map(p => p.category).filter(Boolean))];

  res.json({ products: enriched, categories });
});

router.get("/public/settings/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const tenantId = await getTenantBySlug(slug);
  if (!tenantId) { res.status(404).json({ error: "Business not found" }); return; }

  const settings = await getAllSettingsForTenant(tenantId);
  const publicSettings = {
    business_name: settings.business_name,
    business_address: settings.business_address,
    business_phone: settings.business_phone,
    tax_rate: settings.tax_rate,
    receipt_footer: settings.receipt_footer,
    base_currency: settings.base_currency,
    secondary_currency: settings.secondary_currency,
    currency_rate: settings.currency_rate,
  };
  res.json(publicSettings);
});

const CreatePublicOrderBody = z.object({
  items: z.array(z.object({
    productId: z.number().int(),
    quantity: z.number().int().min(1),
    variantChoices: z.array(z.object({ optionId: z.number().int(), optionName: z.string(), groupName: z.string(), priceAdjustment: z.number() })).optional().default([]),
    modifierChoices: z.array(z.object({ optionId: z.number().int(), optionName: z.string(), groupName: z.string(), priceAdjustment: z.number() })).optional().default([]),
  })).min(1),
  customerName: z.string().optional(),
  customerEmail: z.string().optional(),
  notes: z.string().optional(),
  orderType: z.enum(["online", "kiosk"]).default("online"),
});

router.post("/public/orders/:slug", async (req, res): Promise<void> => {
  const { slug } = req.params;
  const tenantId = await getTenantBySlug(slug);
  if (!tenantId) { res.status(404).json({ error: "Business not found" }); return; }

  const parsed = CreatePublicOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid order", details: parsed.error.issues }); return; }

  const { items, customerName, customerEmail, notes, orderType } = parsed.data;

  const taxRateStr = await (async () => {
    const [row] = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, `${tenantId}:tax_rate`));
    return row?.value ?? "15";
  })();
  const taxRate = parseFloat(taxRateStr) / 100;

  let subtotal = 0;
  const orderItems: {
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    variantChoices: unknown;
    modifierChoices: unknown;
  }[] = [];

  for (const item of items) {
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

    if (!product) { res.status(400).json({ error: `Product ${item.productId} not found` }); return; }

    const variantAdj = (item.variantChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const modifierAdj = (item.modifierChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const unitPrice = product.price + variantAdj + modifierAdj;
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    orderItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      variantChoices: item.variantChoices ?? [],
      modifierChoices: item.modifierChoices ?? [],
    });
  }

  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = subtotal + tax;

  const orderCount = await db.select().from(ordersTable).where(eq(ordersTable.tenantId, tenantId));
  const orderNumber = `${orderType.toUpperCase()}-${String(orderCount.length + 1).padStart(4, "0")}`;

  const [order] = await db.insert(ordersTable).values({
    tenantId,
    orderNumber,
    status: "pending",
    subtotal,
    tax,
    total,
    notes: [
      notes,
      customerName ? `Customer: ${customerName}` : null,
      customerEmail ? `Email: ${customerEmail}` : null,
    ].filter(Boolean).join(" | ") || null,
    orderType,
    paymentMethod: orderType === "kiosk" ? "pending" : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  for (const item of orderItems) {
    await db.insert(orderItemsTable).values({
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      variantChoices: item.variantChoices,
      modifierChoices: item.modifierChoices,
    });
  }

  res.status(201).json({
    orderNumber: order.orderNumber,
    status: order.status,
    subtotal: order.subtotal,
    tax: order.tax,
    total: order.total,
    orderType: order.orderType,
  });
});

export default router;
