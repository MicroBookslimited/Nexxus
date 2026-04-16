import { Router, type IRouter } from "express";
import { db, topupTransactionsTable, topupWalletsTable, topupWalletLedgerTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { verifyTenantToken } from "./saas-auth";
import { logAudit } from "./audit";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}


function getDingKey(): string {
  const key = process.env.DING_API_KEY ?? "";
  return key;
}

async function dingFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const key = getDingKey();
  const encoded = Buffer.from(`${key}:`).toString("base64");
  const res = await fetch(`https://api.dingconnect.com/api/V1${path}`, {
    ...opts,
    headers: {
      "Authorization": `Basic ${encoded}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  return res;
}

async function getOrCreateWallet(tenantId: number): Promise<typeof topupWalletsTable.$inferSelect> {
  const [existing] = await db.select().from(topupWalletsTable).where(eq(topupWalletsTable.tenantId, tenantId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(topupWalletsTable).values({ tenantId, balance: 0, totalTopups: 0, totalCommission: 0 }).returning();
  return created;
}

async function debitWallet(tenantId: number, amount: number, description: string, referenceId?: string): Promise<number> {
  const wallet = await getOrCreateWallet(tenantId);
  const newBalance = Math.max(0, wallet.balance - amount);
  await db.update(topupWalletsTable)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(topupWalletsTable.tenantId, tenantId));
  await db.insert(topupWalletLedgerTable).values({
    tenantId, type: "debit", amount, balanceAfter: newBalance, description,
    referenceId: referenceId ?? null,
  });
  return newBalance;
}

async function creditWallet(tenantId: number, amount: number, description: string, referenceId?: string): Promise<number> {
  const wallet = await getOrCreateWallet(tenantId);
  const newBalance = wallet.balance + amount;
  await db.update(topupWalletsTable)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(topupWalletsTable.tenantId, tenantId));
  await db.insert(topupWalletLedgerTable).values({
    tenantId, type: "credit", amount, balanceAfter: newBalance, description,
    referenceId: referenceId ?? null,
  });
  return newBalance;
}

/* ─── DING API PROXY ─── */

router.get("/topup/countries", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const r = await dingFetch("/GetCountries");
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch countries", details: String(err) });
  }
});

router.get("/topup/operators", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { countryIso } = req.query as { countryIso?: string };
  try {
    const params = new URLSearchParams();
    if (countryIso) params.append("countryIsos[0]", countryIso);
    const r = await dingFetch(`/GetProviders?${params.toString()}`);
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch operators", details: String(err) });
  }
});

router.get("/topup/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { operatorId } = req.query as { operatorId?: string };
  if (!operatorId) { res.status(400).json({ error: "operatorId is required" }); return; }
  try {
    const params = new URLSearchParams();
    params.append("providerCodes[0]", operatorId);
    const r = await dingFetch(`/GetProducts?${params.toString()}`);
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch products", details: String(err) });
  }
});

/* ─── SEND TOP-UP ─── */

router.post("/topup/send", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { phoneNumber, countryCode, operatorId, operatorName, productSkuCode, productName, sendValue, sendCurrency, benefitValue, benefitCurrency, cost, staffId, staffName } = req.body as {
    phoneNumber: string; countryCode: string; operatorId: string; operatorName: string;
    productSkuCode: string; productName: string; sendValue: number; sendCurrency: string;
    benefitValue: number; benefitCurrency: string; cost: number; staffId?: number; staffName?: string;
  };

  if (!phoneNumber || !operatorId || !productSkuCode || !sendValue) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  const wallet = await getOrCreateWallet(tenantId);
  const deductAmount = cost > 0 ? cost : sendValue;
  if (wallet.balance < deductAmount) {
    res.status(402).json({ error: "Insufficient wallet balance", balance: wallet.balance, required: deductAmount });
    return;
  }

  const distributorRef = `NX-${tenantId}-${Date.now()}`;

  const [txn] = await db.insert(topupTransactionsTable).values({
    tenantId, distributorRef, phoneNumber, countryCode: countryCode ?? "JM",
    operatorId, operatorName, productSkuCode, productName,
    sendValue, sendCurrency: sendCurrency ?? "JMD",
    benefitValue: benefitValue ?? sendValue, benefitCurrency: benefitCurrency ?? sendCurrency ?? "JMD",
    cost: deductAmount, commissionEarned: 0,
    status: "pending", staffId: staffId ?? null, staffName: staffName ?? null,
  }).returning();

  if (!getDingKey()) {
    await db.update(topupTransactionsTable)
      .set({ status: "failed", errorMessage: "Ding API key not configured", updatedAt: new Date() })
      .where(eq(topupTransactionsTable.id, txn.id));
    res.status(503).json({ error: "Ding API key not configured. Please contact support." }); return;
  }

  try {
    const body = {
      AccountNumber: phoneNumber,
      ProductSkuCode: productSkuCode,
      DistributorRef: distributorRef,
      ValidateOnly: false,
    };
    const dingRes = await dingFetch("/SendTransfer", { method: "POST", body: JSON.stringify(body) });
    const dingData = await dingRes.json() as { Errors?: { Code: string; Message: string }[]; TransferId?: string; TransferStatus?: number };

    if (!dingRes.ok || (dingData.Errors && dingData.Errors.length > 0)) {
      const errMsg = dingData.Errors?.[0]?.Message ?? `HTTP ${dingRes.status}`;
      await db.update(topupTransactionsTable)
        .set({ status: "failed", errorMessage: errMsg, updatedAt: new Date() })
        .where(eq(topupTransactionsTable.id, txn.id));
      res.status(400).json({ error: errMsg, transaction: { ...txn, status: "failed" } }); return;
    }

    const commission = sendValue - deductAmount;
    const newBalance = await debitWallet(tenantId, deductAmount, `Top-up ${phoneNumber} (${productName})`, String(txn.id));

    await db.update(topupTransactionsTable).set({
      dingTransactionId: dingData.TransferId ?? null,
      status: dingData.TransferStatus === 2 ? "pending" : "success",
      commissionEarned: commission > 0 ? commission : 0,
      updatedAt: new Date(),
    }).where(eq(topupTransactionsTable.id, txn.id));

    await db.update(topupWalletsTable).set({
      totalTopups: sql`${topupWalletsTable.totalTopups} + 1`,
      totalCommission: sql`${topupWalletsTable.totalCommission} + ${commission > 0 ? commission : 0}`,
    }).where(eq(topupWalletsTable.tenantId, tenantId));

    await logAudit({ tenantId, action: "topup.send", entityType: "topup_transaction", entityId: txn.id, newValue: { phoneNumber, productName, sendValue, status: "success" } });

    const [updated] = await db.select().from(topupTransactionsTable).where(eq(topupTransactionsTable.id, txn.id));
    res.json({ success: true, transaction: updated, walletBalance: newBalance });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(topupTransactionsTable)
      .set({ status: "failed", errorMessage: msg, updatedAt: new Date() })
      .where(eq(topupTransactionsTable.id, txn.id));
    res.status(500).json({ error: "Top-up failed", details: msg });
  }
});

/* ─── CHECK TRANSACTION STATUS ─── */

router.get("/topup/status/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  const [txn] = await db.select().from(topupTransactionsTable).where(and(eq(topupTransactionsTable.id, id), eq(topupTransactionsTable.tenantId, tenantId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  if (txn.status === "pending" && txn.dingTransactionId) {
    try {
      const r = await dingFetch(`/GetTransferRecords?transactionId=${encodeURIComponent(txn.dingTransactionId)}`);
      const d = await r.json() as { TransferRecords?: { TransferStatus: number }[] };
      const statusCode = d.TransferRecords?.[0]?.TransferStatus;
      let newStatus = txn.status;
      if (statusCode === 1) newStatus = "success";
      else if (statusCode === 3) newStatus = "failed";
      if (newStatus !== txn.status) {
        await db.update(topupTransactionsTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(topupTransactionsTable.id, id));
        return void res.json({ ...txn, status: newStatus });
      }
    } catch { /* ignore, return last known status */ }
  }
  res.json(txn);
});

/* ─── WALLET ─── */

router.get("/topup/wallet", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const wallet = await getOrCreateWallet(tenantId);
  res.json(wallet);
});

router.get("/topup/wallet/ledger", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ledger = await db.select().from(topupWalletLedgerTable).where(eq(topupWalletLedgerTable.tenantId, tenantId)).orderBy(desc(topupWalletLedgerTable.createdAt)).limit(100);
  res.json(ledger);
});

router.post("/topup/wallet/fund", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { amount, description } = req.body as { amount: number; description?: string };
  if (!amount || amount <= 0) { res.status(400).json({ error: "Amount must be positive" }); return; }
  const newBalance = await creditWallet(tenantId, amount, description ?? "Wallet top-up");
  await logAudit({ tenantId, action: "topup.wallet.fund", entityType: "topup_wallet", entityId: tenantId, newValue: { amount, newBalance } });
  res.json({ success: true, balance: newBalance });
});


/* ─── TRANSACTIONS (history + reports) ─── */

router.get("/topup/transactions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { limit = "50", offset = "0", status, from, to } = req.query as Record<string, string>;

  const conditions = [eq(topupTransactionsTable.tenantId, tenantId)];
  if (status && status !== "all") conditions.push(eq(topupTransactionsTable.status, status));
  if (from) conditions.push(gte(topupTransactionsTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(topupTransactionsTable.createdAt, new Date(to)));

  const rows = await db.select().from(topupTransactionsTable)
    .where(and(...conditions))
    .orderBy(desc(topupTransactionsTable.createdAt))
    .limit(parseInt(limit, 10))
    .offset(parseInt(offset, 10));

  res.json(rows);
});

router.get("/topup/summary", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [todayRows, monthRows, allTime] = await Promise.all([
    db.select({ total: sql<number>`sum(send_value)`, count: sql<number>`count(*)`, commission: sql<number>`sum(commission_earned)` })
      .from(topupTransactionsTable)
      .where(and(eq(topupTransactionsTable.tenantId, tenantId), eq(topupTransactionsTable.status, "success"), gte(topupTransactionsTable.createdAt, todayStart))),
    db.select({ total: sql<number>`sum(send_value)`, count: sql<number>`count(*)`, commission: sql<number>`sum(commission_earned)` })
      .from(topupTransactionsTable)
      .where(and(eq(topupTransactionsTable.tenantId, tenantId), eq(topupTransactionsTable.status, "success"), gte(topupTransactionsTable.createdAt, monthStart))),
    db.select({ total: sql<number>`sum(send_value)`, count: sql<number>`count(*)`, commission: sql<number>`sum(commission_earned)` })
      .from(topupTransactionsTable)
      .where(and(eq(topupTransactionsTable.tenantId, tenantId), eq(topupTransactionsTable.status, "success"))),
  ]);

  const wallet = await getOrCreateWallet(tenantId);

  res.json({
    today: { total: todayRows[0]?.total ?? 0, count: Number(todayRows[0]?.count ?? 0), commission: todayRows[0]?.commission ?? 0 },
    month: { total: monthRows[0]?.total ?? 0, count: Number(monthRows[0]?.count ?? 0), commission: monthRows[0]?.commission ?? 0 },
    allTime: { total: allTime[0]?.total ?? 0, count: Number(allTime[0]?.count ?? 0), commission: allTime[0]?.commission ?? 0 },
    wallet: { balance: wallet.balance },
  });
});

export default router;
