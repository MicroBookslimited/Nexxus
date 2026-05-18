import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import { db, productBatchesTable, productsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

router.get("/product-batches", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rawPid = req.query["productId"];
  const productId = typeof rawPid === "string" ? parseInt(rawPid, 10) : NaN;
  const includeEmpty = req.query["includeEmpty"] === "true";

  const conds = [eq(productBatchesTable.tenantId, tenantId)];
  if (Number.isFinite(productId)) conds.push(eq(productBatchesTable.productId, productId));
  if (!includeEmpty) conds.push(sql`${productBatchesTable.quantityRemaining} > 0`);

  const rows = await db.select({
    id: productBatchesTable.id,
    productId: productBatchesTable.productId,
    productName: productsTable.name,
    batchNumber: productBatchesTable.batchNumber,
    expiryDate: productBatchesTable.expiryDate,
    quantityRemaining: productBatchesTable.quantityRemaining,
    receivedAt: productBatchesTable.receivedAt,
    sourceType: productBatchesTable.sourceType,
    purchaseBillId: productBatchesTable.purchaseBillId,
  })
    .from(productBatchesTable)
    .leftJoin(productsTable, eq(productsTable.id, productBatchesTable.productId))
    .where(and(...conds))
    .orderBy(desc(productBatchesTable.receivedAt));

  res.json({ batches: rows });
});

export default router;
