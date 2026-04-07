import { Router, type IRouter, type Request, type Response } from "express";
import { db, accountingAccountsTable, journalEntriesTable, journalEntryLinesTable, quickbooksConnectionTable, ordersTable, orderItemsTable, productsTable, stockAdjustmentsTable, stockCountSessionsTable, stockCountItemsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ne, inArray, desc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

/* ─── Default Chart of Accounts ─── */
const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash and Bank", type: "asset", subtype: "current_asset", isSystem: true },
  { code: "1100", name: "Accounts Receivable", type: "asset", subtype: "current_asset", isSystem: true },
  { code: "1200", name: "Inventory", type: "asset", subtype: "current_asset", isSystem: true },
  { code: "1300", name: "Prepaid Expenses", type: "asset", subtype: "current_asset", isSystem: false },
  { code: "1500", name: "Equipment & Fixtures", type: "asset", subtype: "fixed_asset", isSystem: false },
  { code: "2000", name: "Accounts Payable", type: "liability", subtype: "current_liability", isSystem: true },
  { code: "2100", name: "Tax Payable (GCT/VAT)", type: "liability", subtype: "current_liability", isSystem: true },
  { code: "2200", name: "Accrued Expenses", type: "liability", subtype: "current_liability", isSystem: false },
  { code: "2500", name: "Long-term Debt", type: "liability", subtype: "long_term_liability", isSystem: false },
  { code: "3000", name: "Owner's Equity", type: "equity", subtype: "equity", isSystem: true },
  { code: "3100", name: "Retained Earnings", type: "equity", subtype: "equity", isSystem: true },
  { code: "4000", name: "Sales Revenue", type: "revenue", subtype: "operating_revenue", isSystem: true },
  { code: "4100", name: "Service Revenue", type: "revenue", subtype: "operating_revenue", isSystem: false },
  { code: "4200", name: "Other Revenue", type: "revenue", subtype: "other_revenue", isSystem: false },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", subtype: "cogs", isSystem: true },
  { code: "5100", name: "Rent Expense", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5200", name: "Utilities Expense", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5300", name: "Payroll Expense", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5400", name: "Marketing & Advertising", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5500", name: "Supplies & Miscellaneous", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5600", name: "Depreciation Expense", type: "expense", subtype: "operating_expense", isSystem: false },
  { code: "5700", name: "Interest Expense", type: "expense", subtype: "other_expense", isSystem: false },
];

async function ensureDefaultAccounts() {
  const existing = await db.select({ code: accountingAccountsTable.code }).from(accountingAccountsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(accountingAccountsTable).values(DEFAULT_ACCOUNTS);
  }
}

/* ─── Chart of Accounts ─── */
router.get("/accounting/accounts", async (_req, res): Promise<void> => {
  await ensureDefaultAccounts();
  const accounts = await db
    .select()
    .from(accountingAccountsTable)
    .where(eq(accountingAccountsTable.isActive, true))
    .orderBy(accountingAccountsTable.code);
  res.json(accounts);
});

const AccountBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  subtype: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.post("/accounting/accounts", async (req, res): Promise<void> => {
  const parsed = AccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [account] = await db.insert(accountingAccountsTable).values(parsed.data).returning();
    res.status(201).json(account);
  } catch {
    res.status(409).json({ error: "Account code already exists" });
  }
});

router.patch("/accounting/accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  const parsed = AccountBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [acc] = await db.update(accountingAccountsTable).set(parsed.data).where(eq(accountingAccountsTable.id, id)).returning();
  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(acc);
});

router.delete("/accounting/accounts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  const [acc] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.id, id));
  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  if (acc.isSystem) { res.status(400).json({ error: "Cannot delete system accounts" }); return; }
  await db.update(accountingAccountsTable).set({ isActive: false }).where(eq(accountingAccountsTable.id, id));
  res.json({ success: true });
});

/* ─── Journal Entries ─── */
router.get("/accounting/journal-entries", async (req, res): Promise<void> => {
  const { from, to, type, limit: lim = "100", offset: off = "0" } = req.query as Record<string, string>;
  let query = db.select().from(journalEntriesTable).$dynamic();

  const filters: any[] = [ne(journalEntriesTable.status, "voided")];
  if (from) filters.push(gte(journalEntriesTable.date, new Date(from)));
  if (to) filters.push(lte(journalEntriesTable.date, new Date(to)));
  if (type) filters.push(eq(journalEntriesTable.type, type));

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(and(...filters))
    .orderBy(sql`${journalEntriesTable.date} DESC`)
    .limit(parseInt(lim, 10))
    .offset(parseInt(off, 10));

  // Load lines for each entry
  if (entries.length === 0) { res.json([]); return; }
  const entryIds = entries.map(e => e.id);
  const lines = await db
    .select({
      id: journalEntryLinesTable.id,
      entryId: journalEntryLinesTable.entryId,
      accountId: journalEntryLinesTable.accountId,
      accountName: accountingAccountsTable.name,
      accountCode: accountingAccountsTable.code,
      accountType: accountingAccountsTable.type,
      description: journalEntryLinesTable.description,
      debit: journalEntryLinesTable.debit,
      credit: journalEntryLinesTable.credit,
    })
    .from(journalEntryLinesTable)
    .leftJoin(accountingAccountsTable, eq(accountingAccountsTable.id, journalEntryLinesTable.accountId))
    .where(inArray(journalEntryLinesTable.entryId, entryIds));

  const linesByEntry = new Map<number, typeof lines>();
  for (const line of lines) {
    if (!linesByEntry.has(line.entryId)) linesByEntry.set(line.entryId, []);
    linesByEntry.get(line.entryId)!.push(line);
  }

  res.json(entries.map(e => ({ ...e, lines: linesByEntry.get(e.id) ?? [] })));
});

const JournalEntryLineBody = z.object({
  accountId: z.number().int(),
  description: z.string().optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
});

const JournalEntryBody = z.object({
  date: z.string(),
  description: z.string().min(1),
  reference: z.string().optional(),
  type: z.enum(["manual", "sales", "purchase", "adjustment"]).default("manual"),
  lines: z.array(JournalEntryLineBody).min(2),
});

router.post("/accounting/journal-entries", async (req, res): Promise<void> => {
  const parsed = JournalEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { lines, ...entryData } = parsed.data;

  // Validate double-entry (debits = credits)
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400).json({ error: `Debits (${totalDebit.toFixed(2)}) must equal Credits (${totalCredit.toFixed(2)})` });
    return;
  }

  const [entry] = await db.insert(journalEntriesTable).values({ ...entryData, date: new Date(entryData.date) }).returning();
  await db.insert(journalEntryLinesTable).values(lines.map(l => ({ ...l, entryId: entry.id })));

  res.status(201).json({ ...entry, lines });
});

router.delete("/accounting/journal-entries/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(journalEntriesTable).set({ status: "voided" }).where(eq(journalEntriesTable.id, id));
  res.json({ success: true });
});

/* ─── Accounting Reports ─── */

// Profit & Loss
router.get("/accounting/reports/profit-loss", async (req, res): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1); // Jan 1 this year
  const toDate = to ? new Date(to) : new Date();

  // Revenue from orders
  const ordersRevenue = await db
    .select({
      subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
      tax: sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
      total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      discount: sql<number>`COALESCE(SUM(COALESCE(${ordersTable.discountValue}, 0)), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        ne(ordersTable.status, "voided"),
        ne(ordersTable.status, "refunded"),
        ne(ordersTable.status, "open"),
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
      )
    );

  const salesRevenue = ordersRevenue[0]?.subtotal ?? 0;
  const taxCollected = ordersRevenue[0]?.tax ?? 0;

  // Revenue by payment method
  const revenueByMethod = await db
    .select({
      method: ordersTable.paymentMethod,
      total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(
      and(
        ne(ordersTable.status, "voided"),
        ne(ordersTable.status, "refunded"),
        ne(ordersTable.status, "open"),
        gte(ordersTable.createdAt, fromDate),
        lte(ordersTable.createdAt, toDate),
      )
    )
    .groupBy(ordersTable.paymentMethod);

  // Manual revenue journal entries
  await ensureDefaultAccounts();
  const revenueAccounts = await db.select({ id: accountingAccountsTable.id }).from(accountingAccountsTable).where(eq(accountingAccountsTable.type, "revenue"));
  const revenueAccountIds = revenueAccounts.map(a => a.id);

  let manualRevenue = 0;
  if (revenueAccountIds.length > 0) {
    const manualRevenueResult = await db
      .select({ total: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit} - ${journalEntryLinesTable.debit}), 0)` })
      .from(journalEntryLinesTable)
      .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
      .where(
        and(
          inArray(journalEntryLinesTable.accountId, revenueAccountIds),
          ne(journalEntriesTable.status, "voided"),
          eq(journalEntriesTable.type, "manual"),
          gte(journalEntriesTable.date, fromDate),
          lte(journalEntriesTable.date, toDate),
        )
      );
    manualRevenue = manualRevenueResult[0]?.total ?? 0;
  }

  // Expenses from journal entries grouped by account
  const expenseAccounts = await db.select({ id: accountingAccountsTable.id, name: accountingAccountsTable.name, code: accountingAccountsTable.code }).from(accountingAccountsTable).where(eq(accountingAccountsTable.type, "expense"));
  const expenseAccountIds = expenseAccounts.map(a => a.id);

  const expenseLines: { accountId: number; name: string; code: string; amount: number }[] = [];
  if (expenseAccountIds.length > 0) {
    const expenseResult = await db
      .select({
        accountId: journalEntryLinesTable.accountId,
        amount: sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit} - ${journalEntryLinesTable.credit}), 0)`,
      })
      .from(journalEntryLinesTable)
      .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
      .where(
        and(
          inArray(journalEntryLinesTable.accountId, expenseAccountIds),
          ne(journalEntriesTable.status, "voided"),
          gte(journalEntriesTable.date, fromDate),
          lte(journalEntriesTable.date, toDate),
        )
      )
      .groupBy(journalEntryLinesTable.accountId);

    for (const row of expenseResult) {
      const acc = expenseAccounts.find(a => a.id === row.accountId);
      if (acc && row.amount > 0) expenseLines.push({ accountId: row.accountId, name: acc.name, code: acc.code, amount: row.amount });
    }
  }

  const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0);
  const totalRevenue = salesRevenue + manualRevenue;
  const grossProfit = totalRevenue - (expenseLines.find(e => e.code === "5000")?.amount ?? 0);
  const netIncome = totalRevenue - totalExpenses;

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    revenue: {
      sales: salesRevenue,
      manual: manualRevenue,
      total: totalRevenue,
      byPaymentMethod: revenueByMethod,
    },
    taxCollected,
    expenses: expenseLines,
    totalExpenses,
    grossProfit,
    netIncome,
  });
});

// Trial Balance
router.get("/accounting/reports/trial-balance", async (req, res): Promise<void> => {
  await ensureDefaultAccounts();
  const { as_of } = req.query as Record<string, string>;
  const asOf = as_of ? new Date(as_of) : new Date();

  const accounts = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.isActive, true)).orderBy(accountingAccountsTable.code);

  const lines = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      totalDebit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
    })
    .from(journalEntryLinesTable)
    .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
    .where(
      and(
        ne(journalEntriesTable.status, "voided"),
        lte(journalEntriesTable.date, asOf),
      )
    )
    .groupBy(journalEntryLinesTable.accountId);

  const balanceMap = new Map(lines.map(l => [l.accountId, { debit: l.totalDebit, credit: l.totalCredit }]));

  const rows = accounts.map(acc => {
    const balance = balanceMap.get(acc.id) ?? { debit: 0, credit: 0 };
    return { ...acc, totalDebit: balance.debit, totalCredit: balance.credit };
  });

  const totalDebits = rows.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredits = rows.reduce((s, r) => s + r.totalCredit, 0);

  res.json({ asOf: asOf.toISOString(), accounts: rows, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 });
});

// Balance Sheet
router.get("/accounting/reports/balance-sheet", async (req, res): Promise<void> => {
  await ensureDefaultAccounts();
  const { as_of } = req.query as Record<string, string>;
  const asOf = as_of ? new Date(as_of) : new Date();

  const accounts = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.isActive, true)).orderBy(accountingAccountsTable.code);
  const lines = await db
    .select({
      accountId: journalEntryLinesTable.accountId,
      totalDebit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
    })
    .from(journalEntryLinesTable)
    .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
    .where(and(ne(journalEntriesTable.status, "voided"), lte(journalEntriesTable.date, asOf)))
    .groupBy(journalEntryLinesTable.accountId);

  const balanceMap = new Map(lines.map(l => [l.accountId, { debit: l.totalDebit, credit: l.totalCredit }]));

  function accountBalance(acc: typeof accounts[0]) {
    const b = balanceMap.get(acc.id) ?? { debit: 0, credit: 0 };
    if (acc.type === "asset" || acc.type === "expense") return b.debit - b.credit;
    return b.credit - b.debit;
  }

  const assets = accounts.filter(a => a.type === "asset").map(a => ({ ...a, balance: accountBalance(a) }));
  const liabilities = accounts.filter(a => a.type === "liability").map(a => ({ ...a, balance: accountBalance(a) }));
  const equity = accounts.filter(a => a.type === "equity").map(a => ({ ...a, balance: accountBalance(a) }));

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity = equity.reduce((s, a) => s + a.balance, 0);

  res.json({
    asOf: asOf.toISOString(),
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

/* ─── QuickBooks OAuth ─── */
const QB_AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company";
const QB_SCOPE = "com.intuit.quickbooks.accounting";

function getQbCredentials() {
  const clientId = process.env["QUICKBOOKS_CLIENT_ID"];
  const clientSecret = process.env["QUICKBOOKS_CLIENT_SECRET"];
  return { clientId, clientSecret, configured: !!(clientId && clientSecret) };
}

router.get("/accounting/quickbooks/status", async (_req, res): Promise<void> => {
  const creds = getQbCredentials();
  const [conn] = await db.select().from(quickbooksConnectionTable).where(eq(quickbooksConnectionTable.isActive, true)).limit(1);

  if (!conn) {
    res.json({ configured: creds.configured, connected: false });
    return;
  }

  const isExpired = conn.expiresAt ? conn.expiresAt < new Date() : false;
  res.json({
    configured: creds.configured,
    connected: true,
    realmId: conn.realmId,
    connectedAt: conn.connectedAt,
    tokenExpired: isExpired,
    lastSyncAt: conn.lastSyncAt,
    lastSyncStatus: conn.lastSyncStatus,
    lastSyncMessage: conn.lastSyncMessage,
  });
});

router.get("/accounting/quickbooks/auth", (req, res): void => {
  const { clientId, configured } = getQbCredentials();
  if (!configured) { res.status(503).json({ error: "QuickBooks credentials not configured" }); return; }

  const origin = req.headers["x-forwarded-proto"]
    ? `${req.headers["x-forwarded-proto"]}://${req.headers["host"]}`
    : `http://${req.headers["host"]}`;
  const redirectUri = `${origin}/api/accounting/quickbooks/callback`;

  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: QB_SCOPE,
    state,
  });

  res.redirect(`${QB_AUTH_BASE}?${params.toString()}`);
});

router.get("/accounting/quickbooks/callback", async (req, res): Promise<void> => {
  const { code, realmId, error } = req.query as Record<string, string>;
  if (error) { res.status(400).send(`QuickBooks OAuth error: ${error}`); return; }
  if (!code || !realmId) { res.status(400).send("Missing code or realmId"); return; }

  const { clientId, clientSecret, configured } = getQbCredentials();
  if (!configured) { res.status(503).send("QuickBooks credentials not configured"); return; }

  const origin = req.headers["x-forwarded-proto"]
    ? `${req.headers["x-forwarded-proto"]}://${req.headers["host"]}`
    : `http://${req.headers["host"]}`;
  const redirectUri = `${origin}/api/accounting/quickbooks/callback`;

  const tokenResp = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }).toString(),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    res.status(500).send(`Token exchange failed: ${err}`);
    return;
  }

  const tokens = await tokenResp.json() as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    x_refresh_token_expires_in: number;
  };

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000);

  // Deactivate old connections, insert new one
  await db.update(quickbooksConnectionTable).set({ isActive: false });
  await db.insert(quickbooksConnectionTable).values({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    realmId,
    tokenType: tokens.token_type,
    expiresAt,
    refreshTokenExpiresAt,
    scope: QB_SCOPE,
    isActive: true,
  });

  // Redirect back to the app's accounting page
  res.redirect("/app/accounting?qb=connected");
});

router.post("/accounting/quickbooks/disconnect", async (_req, res): Promise<void> => {
  await db.update(quickbooksConnectionTable).set({ isActive: false });
  res.json({ success: true });
});

// Refresh QB access token
async function refreshQbToken(conn: { id: number; refreshToken: string | null }) {
  const { clientId, clientSecret } = getQbCredentials();
  if (!conn.refreshToken) throw new Error("No refresh token");

  const tokenResp = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken }).toString(),
  });

  if (!tokenResp.ok) throw new Error("Token refresh failed");
  const tokens = await tokenResp.json() as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000);

  await db.update(quickbooksConnectionTable).set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, refreshTokenExpiresAt }).where(eq(quickbooksConnectionTable.id, conn.id));
  return tokens.access_token;
}

// Sync recent orders to QuickBooks as Sales Receipts
router.post("/accounting/quickbooks/sync", async (req, res): Promise<void> => {
  const [conn] = await db.select().from(quickbooksConnectionTable).where(eq(quickbooksConnectionTable.isActive, true)).limit(1);
  if (!conn) { res.status(400).json({ error: "Not connected to QuickBooks" }); return; }

  let accessToken = conn.accessToken ?? "";
  if (conn.expiresAt && conn.expiresAt < new Date()) {
    try {
      accessToken = await refreshQbToken(conn);
    } catch {
      res.status(401).json({ error: "Token expired. Please reconnect to QuickBooks." });
      return;
    }
  }

  const { days = "7" } = req.body as { days?: string };
  const since = new Date(Date.now() - parseInt(days, 10) * 86400000);

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        ne(ordersTable.status, "voided"),
        ne(ordersTable.status, "refunded"),
        ne(ordersTable.status, "open"),
        gte(ordersTable.createdAt, since),
      )
    )
    .limit(100);

  if (orders.length === 0) {
    await db.update(quickbooksConnectionTable).set({ lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncMessage: "No orders to sync" }).where(eq(quickbooksConnectionTable.id, conn.id));
    res.json({ synced: 0, message: "No orders to sync" });
    return;
  }

  let synced = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const salesReceipt = {
        DocNumber: `POS-${order.id}`,
        TxnDate: order.createdAt.toISOString().split("T")[0],
        PaymentMethodRef: { name: order.paymentMethod ?? "Other" },
        Line: [
          {
            Amount: order.subtotal,
            DetailType: "SalesItemLineDetail",
            Description: `POS Order #${order.id}`,
            SalesItemLineDetail: {
              ItemRef: { name: "Sales", value: "1" },
              UnitPrice: order.subtotal,
              Qty: 1,
            },
          },
        ],
        TxnTaxDetail: order.tax > 0 ? { TotalTax: order.tax } : undefined,
        CustomerRef: { name: "Walk-in Customer", value: "1" },
        PrivateNote: order.notes ?? `POS Order`,
      };

      const qbResp = await fetch(`${QB_API_BASE}/${conn.realmId}/salesreceipt`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ SalesReceipt: salesReceipt }),
      });

      if (qbResp.ok) synced++;
      else { failed++; }
    } catch { failed++; }
  }

  const status = failed === 0 ? "success" : synced > 0 ? "partial" : "failed";
  const message = `Synced ${synced} orders, ${failed} failed`;
  await db.update(quickbooksConnectionTable).set({ lastSyncAt: new Date(), lastSyncStatus: status, lastSyncMessage: message }).where(eq(quickbooksConnectionTable.id, conn.id));

  res.json({ synced, failed, total: orders.length, status, message });
});

/* ─── Overview / KPIs ─── */
router.get("/accounting/overview", async (req, res): Promise<void> => {
  const { period = "month" } = req.query as Record<string, string>;
  const now = new Date();
  let fromDate: Date;
  if (period === "week") fromDate = new Date(now.getTime() - 7 * 86400000);
  else if (period === "year") fromDate = new Date(now.getFullYear(), 0, 1);
  else fromDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const [revenue] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
      tax: sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(and(ne(ordersTable.status, "voided"), ne(ordersTable.status, "refunded"), ne(ordersTable.status, "open"), gte(ordersTable.createdAt, fromDate)));

  await ensureDefaultAccounts();
  const expenseAcctIds = (await db.select({ id: accountingAccountsTable.id }).from(accountingAccountsTable).where(eq(accountingAccountsTable.type, "expense"))).map(a => a.id);

  let totalExpenses = 0;
  if (expenseAcctIds.length > 0) {
    const [exp] = await db
      .select({ total: sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit} - ${journalEntryLinesTable.credit}), 0)` })
      .from(journalEntryLinesTable)
      .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
      .where(and(inArray(journalEntryLinesTable.accountId, expenseAcctIds), ne(journalEntriesTable.status, "voided"), gte(journalEntriesTable.date, fromDate)));
    totalExpenses = exp?.total ?? 0;
  }

  const [entryCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(journalEntriesTable).where(and(ne(journalEntriesTable.status, "voided"), gte(journalEntriesTable.date, fromDate)));

  res.json({
    period,
    from: fromDate.toISOString(),
    to: now.toISOString(),
    revenue: revenue?.subtotal ?? 0,
    taxCollected: revenue?.tax ?? 0,
    totalRevenue: revenue?.total ?? 0,
    totalExpenses,
    netIncome: (revenue?.subtotal ?? 0) - totalExpenses,
    orderCount: revenue?.count ?? 0,
    journalEntryCount: entryCount?.count ?? 0,
  });
});

/* ═══════════════════════════════════════════
   STOCK ADJUSTMENTS
   ═══════════════════════════════════════════ */

const AdjustmentBody = z.object({
  productId: z.number().int(),
  adjustmentType: z.enum(["increase", "decrease"]),
  quantity: z.number().int().positive(),
  reason: z.enum(["damaged", "theft", "received", "returned", "expired", "manual", "correction", "other"]),
  notes: z.string().optional(),
  createJournalEntry: z.boolean().optional().default(false),
  createdBy: z.string().optional(),
});

// List stock adjustments
router.get("/accounting/stock-adjustments", async (req, res): Promise<void> => {
  const { productId, from, to, limit: lim = "50", offset: off = "0" } = req.query as Record<string, string>;
  const filters: any[] = [];
  if (productId) filters.push(eq(stockAdjustmentsTable.productId, parseInt(productId, 10)));
  if (from) filters.push(gte(stockAdjustmentsTable.createdAt, new Date(from)));
  if (to) filters.push(lte(stockAdjustmentsTable.createdAt, new Date(to)));

  const adjustments = await db
    .select()
    .from(stockAdjustmentsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(stockAdjustmentsTable.createdAt))
    .limit(parseInt(lim, 10))
    .offset(parseInt(off, 10));

  res.json(adjustments);
});

// Create a stock adjustment
router.post("/accounting/stock-adjustments", async (req, res): Promise<void> => {
  const parsed = AdjustmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, adjustmentType, quantity, reason, notes, createJournalEntry, createdBy } = parsed.data;

  // Fetch product
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const previousStock = product.stockCount;
  const delta = adjustmentType === "increase" ? quantity : -quantity;
  const newStock = Math.max(0, previousStock + delta);

  // Update product stock
  await db.update(productsTable).set({ stockCount: newStock, inStock: newStock > 0 }).where(eq(productsTable.id, productId));

  // Optionally create journal entry
  let journalEntryId: number | undefined;
  if (createJournalEntry) {
    await ensureDefaultAccounts();
    const [inventoryAccount] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "1200")).limit(1);
    const [cogsAccount] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "5000")).limit(1);
    const [adjAccount] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "5500")).limit(1);

    if (inventoryAccount && cogsAccount && adjAccount) {
      const unitCost = product.price * 0.5; // estimate cost as 50% of price if no cost field
      const amount = quantity * unitCost;

      const [entry] = await db.insert(journalEntriesTable).values({
        date: new Date(),
        description: `Stock ${adjustmentType}: ${product.name} (${reason})`,
        reference: `ADJ-${productId}`,
        type: "adjustment",
        status: "posted",
      }).returning();

      // Increase: DR Inventory, CR Adjustment Account
      // Decrease: DR COGS/Loss, CR Inventory
      const lines = adjustmentType === "increase"
        ? [
            { entryId: entry.id, accountId: inventoryAccount.id, description: `Stock received: ${product.name}`, debit: amount, credit: 0 },
            { entryId: entry.id, accountId: adjAccount.id, description: `Inventory adjustment`, debit: 0, credit: amount },
          ]
        : [
            { entryId: entry.id, accountId: cogsAccount.id, description: `Stock loss: ${product.name} (${reason})`, debit: amount, credit: 0 },
            { entryId: entry.id, accountId: inventoryAccount.id, description: `Inventory reduction`, debit: 0, credit: amount },
          ];

      await db.insert(journalEntryLinesTable).values(lines);
      journalEntryId = entry.id;
    }
  }

  // Record adjustment
  const [adjustment] = await db.insert(stockAdjustmentsTable).values({
    productId,
    productName: product.name,
    adjustmentType,
    quantity,
    reason,
    notes,
    previousStock,
    newStock,
    unitCost: product.price * 0.5,
    journalEntryId,
    createdBy,
  }).returning();

  res.status(201).json({ ...adjustment, product: { id: product.id, name: product.name, newStock } });
});

/* ═══════════════════════════════════════════
   STOCK COUNT
   ═══════════════════════════════════════════ */

// List stock count sessions
router.get("/accounting/stock-counts", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(stockCountSessionsTable)
    .orderBy(desc(stockCountSessionsTable.startedAt))
    .limit(20);
  res.json(sessions);
});

// Create a new stock count session (snapshots current stock levels)
router.post("/accounting/stock-counts", async (req, res): Promise<void> => {
  const { name, notes, createdBy, categoryFilter } = req.body as { name: string; notes?: string; createdBy?: string; categoryFilter?: string };
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }

  // Fetch all active products
  let productQuery = db.select().from(productsTable).$dynamic();
  if (categoryFilter) productQuery = productQuery.where(eq(productsTable.category, categoryFilter));
  const products = await productQuery.orderBy(productsTable.category, productsTable.name);

  // Create session
  const [session] = await db.insert(stockCountSessionsTable).values({
    name,
    notes,
    createdBy,
    status: "in_progress",
    totalItems: products.length,
  }).returning();

  // Create items (snapshot of current stock)
  if (products.length > 0) {
    await db.insert(stockCountItemsTable).values(products.map(p => ({
      sessionId: session.id,
      productId: p.id,
      productName: p.name,
      productCategory: p.category,
      systemCount: p.stockCount,
      unitCost: p.price * 0.5,
    })));
  }

  res.status(201).json({ ...session, itemCount: products.length });
});

// Get stock count session with all items
router.get("/accounting/stock-counts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  const [session] = await db.select().from(stockCountSessionsTable).where(eq(stockCountSessionsTable.id, id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const items = await db
    .select()
    .from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.sessionId, id))
    .orderBy(stockCountItemsTable.productCategory, stockCountItemsTable.productName);

  res.json({ ...session, items });
});

// Update a count item (set physical count)
router.patch("/accounting/stock-counts/:id/items/:itemId", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const itemId = parseInt(req.params["itemId"] ?? "0", 10);
  const { physicalCount } = req.body as { physicalCount: number };

  if (typeof physicalCount !== "number" || physicalCount < 0) {
    res.status(400).json({ error: "physicalCount must be a non-negative number" });
    return;
  }

  const [item] = await db.select().from(stockCountItemsTable).where(
    and(eq(stockCountItemsTable.id, itemId), eq(stockCountItemsTable.sessionId, sessionId))
  );
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const discrepancy = physicalCount - item.systemCount;
  const [updated] = await db.update(stockCountItemsTable).set({ physicalCount, discrepancy }).where(eq(stockCountItemsTable.id, itemId)).returning();

  res.json(updated);
});

// Apply a stock count (adjust all products with discrepancies)
router.post("/accounting/stock-counts/:id/apply", async (req, res): Promise<void> => {
  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const { createJournalEntries = false } = req.body as { createJournalEntries?: boolean };

  const [session] = await db.select().from(stockCountSessionsTable).where(eq(stockCountSessionsTable.id, sessionId));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status === "completed") { res.status(400).json({ error: "Session already applied" }); return; }

  const items = await db.select().from(stockCountItemsTable).where(eq(stockCountItemsTable.sessionId, sessionId));
  const discrepancyItems = items.filter(i => i.physicalCount !== null && i.discrepancy !== null && i.discrepancy !== 0);

  let adjustedCount = 0;
  let journalEntryId: number | undefined;

  // Create one consolidate journal entry for all adjustments if requested
  if (createJournalEntries && discrepancyItems.length > 0) {
    await ensureDefaultAccounts();
    const [inventoryAccount] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "1200")).limit(1);
    const [adjAccount] = await db.select().from(accountingAccountsTable).where(eq(accountingAccountsTable.code, "5500")).limit(1);

    if (inventoryAccount && adjAccount) {
      const positiveAdjustments = discrepancyItems.filter(i => (i.discrepancy ?? 0) > 0);
      const negativeAdjustments = discrepancyItems.filter(i => (i.discrepancy ?? 0) < 0);
      const positiveTotal = positiveAdjustments.reduce((s, i) => s + (i.discrepancy ?? 0) * (i.unitCost ?? 0), 0);
      const negativeTotal = negativeAdjustments.reduce((s, i) => s + Math.abs(i.discrepancy ?? 0) * (i.unitCost ?? 0), 0);
      const netChange = positiveTotal - negativeTotal;

      if (Math.abs(netChange) > 0.01) {
        const [entry] = await db.insert(journalEntriesTable).values({
          date: new Date(),
          description: `Stock Count Adjustment: ${session.name}`,
          reference: `COUNT-${sessionId}`,
          type: "adjustment",
          status: "posted",
        }).returning();

        const lines: any[] = [];
        if (netChange > 0) {
          // Net inventory increase
          lines.push({ entryId: entry.id, accountId: inventoryAccount.id, debit: netChange, credit: 0, description: "Inventory count increase" });
          lines.push({ entryId: entry.id, accountId: adjAccount.id, debit: 0, credit: netChange, description: "Inventory adjustment offset" });
        } else {
          // Net inventory decrease
          lines.push({ entryId: entry.id, accountId: adjAccount.id, debit: Math.abs(netChange), credit: 0, description: "Inventory count loss" });
          lines.push({ entryId: entry.id, accountId: inventoryAccount.id, debit: 0, credit: Math.abs(netChange), description: "Inventory count reduction" });
        }
        await db.insert(journalEntryLinesTable).values(lines);
        journalEntryId = entry.id;
      }
    }
  }

  // Apply adjustments to product stock
  for (const item of discrepancyItems) {
    if (item.physicalCount === null) continue;
    await db.update(productsTable).set({ stockCount: item.physicalCount, inStock: item.physicalCount > 0 }).where(eq(productsTable.id, item.productId));

    // Record individual stock adjustment
    await db.insert(stockAdjustmentsTable).values({
      productId: item.productId,
      productName: item.productName,
      adjustmentType: (item.discrepancy ?? 0) > 0 ? "increase" : "decrease",
      quantity: Math.abs(item.discrepancy ?? 0),
      reason: "correction",
      notes: `Stock count: ${session.name}`,
      previousStock: item.systemCount,
      newStock: item.physicalCount,
      unitCost: item.unitCost,
      journalEntryId,
    });

    await db.update(stockCountItemsTable).set({ isAdjusted: true }).where(eq(stockCountItemsTable.id, item.id));
    adjustedCount++;
  }

  // Update session status
  const totalDiscrepancies = items.filter(i => i.physicalCount !== null && i.discrepancy !== 0).length;
  await db.update(stockCountSessionsTable).set({ status: "completed", completedAt: new Date(), totalDiscrepancies }).where(eq(stockCountSessionsTable.id, sessionId));

  res.json({ adjusted: adjustedCount, discrepancies: discrepancyItems.length, journalEntryId, message: `Applied ${adjustedCount} stock adjustments` });
});

// Void a stock count session
router.delete("/accounting/stock-counts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(stockCountSessionsTable).set({ status: "voided" }).where(eq(stockCountSessionsTable.id, id));
  res.json({ success: true });
});

// Get available product categories
router.get("/accounting/stock-counts/categories", async (_req, res): Promise<void> => {
  const cats = await db.selectDistinct({ category: productsTable.category }).from(productsTable).orderBy(productsTable.category);
  res.json(cats.map(c => c.category));
});

export default router;
