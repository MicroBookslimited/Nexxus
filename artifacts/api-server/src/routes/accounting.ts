import { Router, type IRouter } from "express";
import { db, accountingAccountsTable, journalEntriesTable, journalEntryLinesTable, quickbooksConnectionTable, ordersTable, orderItemsTable, productsTable, stockAdjustmentsTable, stockCountSessionsTable, stockCountItemsTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ne, inArray, desc, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

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

async function ensureDefaultAccounts(tenantId: number) {
  const existing = await db.select({ code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(eq(accountingAccountsTable.tenantId, tenantId))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(accountingAccountsTable).values(DEFAULT_ACCOUNTS.map(a => ({ ...a, tenantId })));
  }
}

/* ─── Chart of Accounts ─── */
router.get("/accounting/accounts", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await ensureDefaultAccounts(tenantId);
  const accounts = await db
    .select()
    .from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.isActive, true)))
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
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = AccountBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [account] = await db.insert(accountingAccountsTable).values({ ...parsed.data, tenantId }).returning();
    res.status(201).json(account);
  } catch {
    res.status(409).json({ error: "Account code already exists" });
  }
});

router.patch("/accounting/accounts/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  const parsed = AccountBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [acc] = await db.update(accountingAccountsTable).set(parsed.data)
    .where(and(eq(accountingAccountsTable.id, id), eq(accountingAccountsTable.tenantId, tenantId)))
    .returning();
  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  res.json(acc);
});

router.delete("/accounting/accounts/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  const [acc] = await db.select().from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.id, id), eq(accountingAccountsTable.tenantId, tenantId)));
  if (!acc) { res.status(404).json({ error: "Account not found" }); return; }
  if (acc.isSystem) { res.status(400).json({ error: "Cannot delete system accounts" }); return; }
  await db.update(accountingAccountsTable).set({ isActive: false })
    .where(and(eq(accountingAccountsTable.id, id), eq(accountingAccountsTable.tenantId, tenantId)));
  res.json({ success: true });
});

/* ─── Journal Entries ─── */
router.get("/accounting/journal-entries", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { from, to, type, limit: lim = "100", offset: off = "0" } = req.query as Record<string, string>;

  const filters: Parameters<typeof and>[0][] = [
    ne(journalEntriesTable.status, "voided"),
    eq(journalEntriesTable.tenantId, tenantId),
  ];
  if (from) filters.push(gte(journalEntriesTable.date, new Date(from)));
  if (to)   filters.push(lte(journalEntriesTable.date, new Date(to)));
  if (type) filters.push(eq(journalEntriesTable.type, type));

  const entries = await db
    .select()
    .from(journalEntriesTable)
    .where(and(...filters))
    .orderBy(sql`${journalEntriesTable.date} DESC`)
    .limit(parseInt(lim, 10))
    .offset(parseInt(off, 10));

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
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = JournalEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { lines, ...entryData } = parsed.data;

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    res.status(400).json({ error: `Debits (${totalDebit.toFixed(2)}) must equal Credits (${totalCredit.toFixed(2)})` });
    return;
  }

  const [entry] = await db.insert(journalEntriesTable)
    .values({ ...entryData, tenantId, date: new Date(entryData.date) })
    .returning();
  await db.insert(journalEntryLinesTable).values(lines.map(l => ({ ...l, entryId: entry.id })));

  res.status(201).json({ ...entry, lines });
});

router.delete("/accounting/journal-entries/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(journalEntriesTable).set({ status: "voided" })
    .where(and(eq(journalEntriesTable.id, id), eq(journalEntriesTable.tenantId, tenantId)));
  res.json({ success: true });
});

/* ─── Accounting Reports ─── */

// Profit & Loss
router.get("/accounting/reports/profit-loss", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { from, to } = req.query as Record<string, string>;
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate   = to ? new Date(to) : new Date();

  const ordersRevenue = await db
    .select({
      subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
      tax:      sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
      total:    sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      discount: sql<number>`COALESCE(SUM(COALESCE(${ordersTable.discountValue}, 0)), 0)`,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      ne(ordersTable.status, "voided"),
      ne(ordersTable.status, "refunded"),
      ne(ordersTable.status, "open"),
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
    ));

  const salesRevenue  = ordersRevenue[0]?.subtotal ?? 0;
  const taxCollected  = ordersRevenue[0]?.tax ?? 0;

  const revenueByMethod = await db
    .select({
      method: ordersTable.paymentMethod,
      total:  sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      count:  sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      ne(ordersTable.status, "voided"),
      ne(ordersTable.status, "refunded"),
      ne(ordersTable.status, "open"),
      gte(ordersTable.createdAt, fromDate),
      lte(ordersTable.createdAt, toDate),
    ))
    .groupBy(ordersTable.paymentMethod);

  await ensureDefaultAccounts(tenantId);

  const revenueAccounts = await db.select({ id: accountingAccountsTable.id })
    .from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.type, "revenue")));
  const revenueAccountIds = revenueAccounts.map(a => a.id);

  let manualRevenue = 0;
  if (revenueAccountIds.length > 0) {
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit} - ${journalEntryLinesTable.debit}), 0)` })
      .from(journalEntryLinesTable)
      .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
      .where(and(
        inArray(journalEntryLinesTable.accountId, revenueAccountIds),
        eq(journalEntriesTable.tenantId, tenantId),
        ne(journalEntriesTable.status, "voided"),
        eq(journalEntriesTable.type, "manual"),
        gte(journalEntriesTable.date, fromDate),
        lte(journalEntriesTable.date, toDate),
      ));
    manualRevenue = result?.total ?? 0;
  }

  const expenseAccounts = await db.select({ id: accountingAccountsTable.id, name: accountingAccountsTable.name, code: accountingAccountsTable.code })
    .from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.type, "expense")));
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
      .where(and(
        inArray(journalEntryLinesTable.accountId, expenseAccountIds),
        eq(journalEntriesTable.tenantId, tenantId),
        ne(journalEntriesTable.status, "voided"),
        gte(journalEntriesTable.date, fromDate),
        lte(journalEntriesTable.date, toDate),
      ))
      .groupBy(journalEntryLinesTable.accountId);

    for (const row of expenseResult) {
      const acc = expenseAccounts.find(a => a.id === row.accountId);
      if (acc && row.amount > 0) expenseLines.push({ accountId: row.accountId, name: acc.name, code: acc.code, amount: row.amount });
    }
  }

  const totalExpenses  = expenseLines.reduce((s, l) => s + l.amount, 0);
  const totalRevenue   = salesRevenue + manualRevenue;
  const grossProfit    = totalRevenue - (expenseLines.find(e => e.code === "5000")?.amount ?? 0);
  const netIncome      = totalRevenue - totalExpenses;

  res.json({
    period: { from: fromDate.toISOString(), to: toDate.toISOString() },
    revenue: { sales: salesRevenue, manual: manualRevenue, total: totalRevenue, byPaymentMethod: revenueByMethod },
    taxCollected,
    expenses: expenseLines,
    totalExpenses,
    grossProfit,
    netIncome,
  });
});

// Trial Balance
router.get("/accounting/reports/trial-balance", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await ensureDefaultAccounts(tenantId);
  const { as_of } = req.query as Record<string, string>;
  const asOf = as_of ? new Date(as_of) : new Date();

  const accounts = await db.select().from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.isActive, true)))
    .orderBy(accountingAccountsTable.code);

  const lines = await db
    .select({
      accountId:   journalEntryLinesTable.accountId,
      totalDebit:  sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
    })
    .from(journalEntryLinesTable)
    .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
    .where(and(
      eq(journalEntriesTable.tenantId, tenantId),
      ne(journalEntriesTable.status, "voided"),
      lte(journalEntriesTable.date, asOf),
    ))
    .groupBy(journalEntryLinesTable.accountId);

  const balanceMap = new Map(lines.map(l => [l.accountId, { debit: l.totalDebit, credit: l.totalCredit }]));

  const rows = accounts.map(acc => {
    const balance = balanceMap.get(acc.id) ?? { debit: 0, credit: 0 };
    return { ...acc, totalDebit: balance.debit, totalCredit: balance.credit };
  });

  const totalDebits  = rows.reduce((s, r) => s + r.totalDebit,  0);
  const totalCredits = rows.reduce((s, r) => s + r.totalCredit, 0);

  res.json({ asOf: asOf.toISOString(), accounts: rows, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 });
});

// Balance Sheet
router.get("/accounting/reports/balance-sheet", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await ensureDefaultAccounts(tenantId);
  const { as_of } = req.query as Record<string, string>;
  const asOf = as_of ? new Date(as_of) : new Date();

  const accounts = await db.select().from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.isActive, true)))
    .orderBy(accountingAccountsTable.code);

  const lines = await db
    .select({
      accountId:   journalEntryLinesTable.accountId,
      totalDebit:  sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit}), 0)`,
      totalCredit: sql<number>`COALESCE(SUM(${journalEntryLinesTable.credit}), 0)`,
    })
    .from(journalEntryLinesTable)
    .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
    .where(and(eq(journalEntriesTable.tenantId, tenantId), ne(journalEntriesTable.status, "voided"), lte(journalEntriesTable.date, asOf)))
    .groupBy(journalEntryLinesTable.accountId);

  const balanceMap = new Map(lines.map(l => [l.accountId, { debit: l.totalDebit, credit: l.totalCredit }]));

  function accountBalance(acc: typeof accounts[0]) {
    const b = balanceMap.get(acc.id) ?? { debit: 0, credit: 0 };
    if (acc.type === "asset" || acc.type === "expense") return b.debit - b.credit;
    return b.credit - b.debit;
  }

  const assets      = accounts.filter(a => a.type === "asset").map(a => ({ ...a, balance: accountBalance(a) }));
  const liabilities = accounts.filter(a => a.type === "liability").map(a => ({ ...a, balance: accountBalance(a) }));
  const equity      = accounts.filter(a => a.type === "equity").map(a => ({ ...a, balance: accountBalance(a) }));

  const totalAssets      = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquity      = equity.reduce((s, a) => s + a.balance, 0);

  res.json({
    asOf: asOf.toISOString(),
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  });
});

/* ─── QuickBooks OAuth ─── */
const QB_AUTH_BASE  = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL  = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_API_BASE   = "https://quickbooks.api.intuit.com/v3/company";
const QB_SCOPE      = "com.intuit.quickbooks.accounting";

function getQbCredentials() {
  const clientId     = process.env["QUICKBOOKS_CLIENT_ID"];
  const clientSecret = process.env["QUICKBOOKS_CLIENT_SECRET"];
  return { clientId, clientSecret, configured: !!(clientId && clientSecret) };
}

router.get("/accounting/quickbooks/status", async (_req, res): Promise<void> => {
  const creds = getQbCredentials();
  const [conn] = await db.select().from(quickbooksConnectionTable).where(eq(quickbooksConnectionTable.isActive, true)).limit(1);

  if (!conn) { res.json({ configured: creds.configured, connected: false }); return; }

  const isExpired = conn.expiresAt ? conn.expiresAt < new Date() : false;
  res.json({
    configured:      creds.configured,
    connected:       true,
    realmId:         conn.realmId,
    connectedAt:     conn.connectedAt,
    tokenExpired:    isExpired,
    lastSyncAt:      conn.lastSyncAt,
    lastSyncStatus:  conn.lastSyncStatus,
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
    access_token: string; refresh_token: string; token_type: string;
    expires_in: number; x_refresh_token_expires_in: number;
  };

  const expiresAt              = new Date(Date.now() + tokens.expires_in * 1000);
  const refreshTokenExpiresAt  = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000);

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

  res.redirect("/app/accounting?qb=connected");
});

router.post("/accounting/quickbooks/disconnect", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  await db.update(quickbooksConnectionTable).set({ isActive: false });
  res.json({ success: true });
});

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
  const expiresAt             = new Date(Date.now() + tokens.expires_in * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000);

  await db.update(quickbooksConnectionTable).set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, refreshTokenExpiresAt }).where(eq(quickbooksConnectionTable.id, conn.id));
  return tokens.access_token;
}

router.post("/accounting/quickbooks/sync", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

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
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      ne(ordersTable.status, "voided"),
      ne(ordersTable.status, "refunded"),
      ne(ordersTable.status, "open"),
      gte(ordersTable.createdAt, since),
    ))
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
        Line: [{
          Amount: order.subtotal,
          DetailType: "SalesItemLineDetail",
          Description: `POS Order #${order.id}`,
          SalesItemLineDetail: { ItemRef: { name: "Sales", value: "1" }, UnitPrice: order.subtotal, Qty: 1 },
        }],
        TxnTaxDetail: order.tax > 0 ? { TotalTax: order.tax } : undefined,
        CustomerRef: { name: "Walk-in Customer", value: "1" },
        PrivateNote: order.notes ?? "POS Order",
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

      if (qbResp.ok) synced++; else failed++;
    } catch { failed++; }
  }

  const status  = failed === 0 ? "success" : synced > 0 ? "partial" : "failed";
  const message = `Synced ${synced} orders, ${failed} failed`;
  await db.update(quickbooksConnectionTable).set({ lastSyncAt: new Date(), lastSyncStatus: status, lastSyncMessage: message }).where(eq(quickbooksConnectionTable.id, conn.id));

  res.json({ synced, failed, total: orders.length, status, message });
});

/* ─── Overview / KPIs ─── */
router.get("/accounting/overview", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { period = "month" } = req.query as Record<string, string>;
  const now = new Date();
  let fromDate: Date;
  if (period === "week")      fromDate = new Date(now.getTime() - 7 * 86400000);
  else if (period === "year") fromDate = new Date(now.getFullYear(), 0, 1);
  else                        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);

  const [revenue] = await db
    .select({
      total:    sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
      tax:      sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
      count:    sql<number>`COUNT(*)`,
    })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      ne(ordersTable.status, "voided"),
      ne(ordersTable.status, "refunded"),
      ne(ordersTable.status, "open"),
      gte(ordersTable.createdAt, fromDate),
    ));

  await ensureDefaultAccounts(tenantId);
  const expenseAcctIds = (await db.select({ id: accountingAccountsTable.id })
    .from(accountingAccountsTable)
    .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.type, "expense"))))
    .map(a => a.id);

  let totalExpenses = 0;
  if (expenseAcctIds.length > 0) {
    const [exp] = await db
      .select({ total: sql<number>`COALESCE(SUM(${journalEntryLinesTable.debit} - ${journalEntryLinesTable.credit}), 0)` })
      .from(journalEntryLinesTable)
      .leftJoin(journalEntriesTable, eq(journalEntriesTable.id, journalEntryLinesTable.entryId))
      .where(and(
        inArray(journalEntryLinesTable.accountId, expenseAcctIds),
        eq(journalEntriesTable.tenantId, tenantId),
        ne(journalEntriesTable.status, "voided"),
        gte(journalEntriesTable.date, fromDate),
      ));
    totalExpenses = exp?.total ?? 0;
  }

  const [entryCount] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(journalEntriesTable)
    .where(and(eq(journalEntriesTable.tenantId, tenantId), ne(journalEntriesTable.status, "voided"), gte(journalEntriesTable.date, fromDate)));

  res.json({
    period,
    from:              fromDate.toISOString(),
    to:                now.toISOString(),
    revenue:           revenue?.subtotal ?? 0,
    taxCollected:      revenue?.tax ?? 0,
    totalRevenue:      revenue?.total ?? 0,
    totalExpenses,
    netIncome:         (revenue?.subtotal ?? 0) - totalExpenses,
    orderCount:        revenue?.count ?? 0,
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

router.get("/accounting/stock-adjustments", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { productId, from, to, limit: lim = "50", offset: off = "0" } = req.query as Record<string, string>;
  const filters: Parameters<typeof and>[0][] = [eq(stockAdjustmentsTable.tenantId, tenantId)];
  if (productId) filters.push(eq(stockAdjustmentsTable.productId, parseInt(productId, 10)));
  if (from)      filters.push(gte(stockAdjustmentsTable.createdAt, new Date(from)));
  if (to)        filters.push(lte(stockAdjustmentsTable.createdAt, new Date(to)));

  const adjustments = await db
    .select()
    .from(stockAdjustmentsTable)
    .where(and(...filters))
    .orderBy(desc(stockAdjustmentsTable.createdAt))
    .limit(parseInt(lim, 10))
    .offset(parseInt(off, 10));

  res.json(adjustments);
});

router.post("/accounting/stock-adjustments", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = AdjustmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { productId, adjustmentType, quantity, reason, notes, createJournalEntry, createdBy } = parsed.data;

  const [product] = await db.select().from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const previousStock = product.stockCount;
  const delta         = adjustmentType === "increase" ? quantity : -quantity;
  const newStock      = Math.max(0, previousStock + delta);

  await db.update(productsTable).set({ stockCount: newStock, inStock: newStock > 0 })
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));

  let journalEntryId: number | undefined;
  if (createJournalEntry) {
    await ensureDefaultAccounts(tenantId);
    const [inventoryAccount] = await db.select().from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.code, "1200"))).limit(1);
    const [cogsAccount] = await db.select().from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.code, "5000"))).limit(1);
    const [adjAccount] = await db.select().from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.code, "5500"))).limit(1);

    if (inventoryAccount && cogsAccount && adjAccount) {
      const unitCost = product.price * 0.5;
      const amount   = quantity * unitCost;

      const [entry] = await db.insert(journalEntriesTable).values({
        tenantId,
        date: new Date(),
        description: `Stock ${adjustmentType}: ${product.name} (${reason})`,
        reference: `ADJ-${productId}`,
        type: "adjustment",
        status: "posted",
      }).returning();

      const lines = adjustmentType === "increase"
        ? [
            { entryId: entry.id, accountId: inventoryAccount.id, description: `Stock received: ${product.name}`, debit: amount, credit: 0 },
            { entryId: entry.id, accountId: adjAccount.id, description: "Inventory adjustment", debit: 0, credit: amount },
          ]
        : [
            { entryId: entry.id, accountId: cogsAccount.id, description: `Stock loss: ${product.name} (${reason})`, debit: amount, credit: 0 },
            { entryId: entry.id, accountId: inventoryAccount.id, description: "Inventory reduction", debit: 0, credit: amount },
          ];

      await db.insert(journalEntryLinesTable).values(lines);
      journalEntryId = entry.id;
    }
  }

  const [adjustment] = await db.insert(stockAdjustmentsTable).values({
    tenantId,
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

router.get("/accounting/stock-counts", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessions = await db
    .select()
    .from(stockCountSessionsTable)
    .where(eq(stockCountSessionsTable.tenantId, tenantId))
    .orderBy(desc(stockCountSessionsTable.startedAt))
    .limit(20);
  res.json(sessions);
});

router.post("/accounting/stock-counts", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, notes, createdBy, categoryFilter } = req.body as { name: string; notes?: string; createdBy?: string; categoryFilter?: string };
  if (!name) { res.status(400).json({ error: "Name is required" }); return; }

  let productQuery = db.select().from(productsTable)
    .where(and(
      eq(productsTable.tenantId, tenantId),
      ne(productsTable.productType, "composite"),
    ))
    .$dynamic();
  if (categoryFilter) productQuery = productQuery.where(eq(productsTable.category, categoryFilter));
  const products = await productQuery.orderBy(productsTable.category, productsTable.name);

  const [session] = await db.insert(stockCountSessionsTable).values({
    tenantId,
    name,
    notes,
    createdBy,
    status: "in_progress",
    totalItems: products.length,
  }).returning();

  if (products.length > 0) {
    await db.insert(stockCountItemsTable).values(products.map(p => ({
      sessionId:       session.id,
      productId:       p.id,
      productName:     p.name,
      productCategory: p.category,
      systemCount:     p.stockCount,
      unitCost:        p.price * 0.5,
    })));
  }

  res.status(201).json({ ...session, itemCount: products.length });
});

router.get("/accounting/stock-counts/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  const [session] = await db.select().from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, id), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const items = await db
    .select()
    .from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.sessionId, id))
    .orderBy(stockCountItemsTable.productCategory, stockCountItemsTable.productName);

  res.json({ ...session, items });
});

router.patch("/accounting/stock-counts/:id/items/:itemId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const itemId    = parseInt(req.params["itemId"] ?? "0", 10);
  const { physicalCount } = req.body as { physicalCount: number };

  if (typeof physicalCount !== "number" || physicalCount < 0) {
    res.status(400).json({ error: "physicalCount must be a non-negative number" });
    return;
  }

  // Verify the session belongs to this tenant
  const [session] = await db.select({ id: stockCountSessionsTable.id }).from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [item] = await db.select().from(stockCountItemsTable).where(
    and(eq(stockCountItemsTable.id, itemId), eq(stockCountItemsTable.sessionId, sessionId))
  );
  if (!item) { res.status(404).json({ error: "Item not found" }); return; }

  const discrepancy = physicalCount - item.systemCount;
  const [updated] = await db.update(stockCountItemsTable).set({ physicalCount, discrepancy }).where(eq(stockCountItemsTable.id, itemId)).returning();

  res.json(updated);
});

router.post("/accounting/stock-counts/:id/apply", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const { createJournalEntries = false } = req.body as { createJournalEntries?: boolean };

  const [session] = await db.select().from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status === "completed") { res.status(400).json({ error: "Session already applied" }); return; }

  const items = await db.select().from(stockCountItemsTable).where(eq(stockCountItemsTable.sessionId, sessionId));
  const discrepancyItems = items.filter(i => i.physicalCount !== null && i.discrepancy !== null && i.discrepancy !== 0);

  let adjustedCount  = 0;
  let journalEntryId: number | undefined;

  if (createJournalEntries && discrepancyItems.length > 0) {
    await ensureDefaultAccounts(tenantId);
    const [inventoryAccount] = await db.select().from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.code, "1200"))).limit(1);
    const [adjAccount] = await db.select().from(accountingAccountsTable)
      .where(and(eq(accountingAccountsTable.tenantId, tenantId), eq(accountingAccountsTable.code, "5500"))).limit(1);

    if (inventoryAccount && adjAccount) {
      const positiveAdjustments = discrepancyItems.filter(i => (i.discrepancy ?? 0) > 0);
      const negativeAdjustments = discrepancyItems.filter(i => (i.discrepancy ?? 0) < 0);
      const positiveTotal       = positiveAdjustments.reduce((s, i) => s + (i.discrepancy ?? 0) * (i.unitCost ?? 0), 0);
      const negativeTotal       = negativeAdjustments.reduce((s, i) => s + Math.abs(i.discrepancy ?? 0) * (i.unitCost ?? 0), 0);
      const netChange            = positiveTotal - negativeTotal;

      if (Math.abs(netChange) > 0.01) {
        const [entry] = await db.insert(journalEntriesTable).values({
          tenantId,
          date: new Date(),
          description: `Stock Count Adjustment: ${session.name}`,
          reference: `COUNT-${sessionId}`,
          type: "adjustment",
          status: "posted",
        }).returning();

        const lines: Parameters<typeof db.insert>[0][] = [];
        if (netChange > 0) {
          lines.push({ entryId: entry.id, accountId: inventoryAccount.id, debit: netChange, credit: 0, description: "Inventory count increase" } as never);
          lines.push({ entryId: entry.id, accountId: adjAccount.id, debit: 0, credit: netChange, description: "Inventory adjustment offset" } as never);
        } else {
          lines.push({ entryId: entry.id, accountId: adjAccount.id, debit: Math.abs(netChange), credit: 0, description: "Inventory count loss" } as never);
          lines.push({ entryId: entry.id, accountId: inventoryAccount.id, debit: 0, credit: Math.abs(netChange), description: "Inventory count reduction" } as never);
        }
        await db.insert(journalEntryLinesTable).values(lines as never);
        journalEntryId = entry.id;
      }
    }
  }

  for (const item of discrepancyItems) {
    if (item.physicalCount === null) continue;
    await db.update(productsTable).set({ stockCount: item.physicalCount, inStock: item.physicalCount > 0 })
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

    await db.insert(stockAdjustmentsTable).values({
      tenantId,
      productId:      item.productId,
      productName:    item.productName,
      adjustmentType: (item.discrepancy ?? 0) > 0 ? "increase" : "decrease",
      quantity:       Math.abs(item.discrepancy ?? 0),
      reason:         "correction",
      notes:          `Stock count: ${session.name}`,
      previousStock:  item.systemCount,
      newStock:       item.physicalCount,
      unitCost:       item.unitCost,
      journalEntryId,
    });

    await db.update(stockCountItemsTable).set({ isAdjusted: true }).where(eq(stockCountItemsTable.id, item.id));
    adjustedCount++;
  }

  const totalDiscrepancies = items.filter(i => i.physicalCount !== null && i.discrepancy !== 0).length;
  await db.update(stockCountSessionsTable).set({ status: "completed", completedAt: new Date(), totalDiscrepancies })
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));

  res.json({ adjusted: adjustedCount, discrepancies: discrepancyItems.length, journalEntryId, message: `Applied ${adjustedCount} stock adjustments` });
});

router.delete("/accounting/stock-counts/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params["id"] ?? "0", 10);
  await db.update(stockCountSessionsTable).set({ status: "voided" })
    .where(and(eq(stockCountSessionsTable.id, id), eq(stockCountSessionsTable.tenantId, tenantId)));
  res.json({ success: true });
});

router.get("/accounting/stock-counts/categories", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const cats = await db.selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .where(eq(productsTable.tenantId, tenantId))
    .orderBy(productsTable.category);
  res.json(cats.map(c => c.category));
});

/* ─── Bulk Stock Count: bulk-set physical counts ─── */
const BulkItem = z.object({
  productId: z.coerce.number().int().positive(),
  physicalCount: z.coerce.number().int().min(0),
});
const BulkBody = z.object({ items: z.array(BulkItem).min(1).max(5000) });

router.post("/accounting/stock-counts/:id/items/bulk", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const parsed = BulkBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [session] = await db.select().from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status === "completed" || session.status === "voided") {
    res.status(400).json({ error: `Session is ${session.status}, cannot edit items` });
    return;
  }

  // Snapshot existing items so we can compute discrepancy and detect unmatched.
  const existing = await db.select().from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.sessionId, sessionId));
  const byProduct = new Map(existing.map(i => [i.productId, i]));

  let updated = 0;
  const unmatched: Array<{ productId: number }> = [];

  for (const { productId, physicalCount } of parsed.data.items) {
    const item = byProduct.get(productId);
    if (!item) { unmatched.push({ productId }); continue; }
    if (item.isAdjusted) continue; // never overwrite already-applied items
    const discrepancy = physicalCount - item.systemCount;
    await db.update(stockCountItemsTable)
      .set({ physicalCount, discrepancy })
      .where(eq(stockCountItemsTable.id, item.id));
    updated++;
  }

  res.json({ updated, unmatched, total: parsed.data.items.length });
});

/* ─── Bulk Stock Count: CSV export ─── */
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/accounting/stock-counts/:id/export.csv", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const [session] = await db.select().from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const items = await db
    .select({
      itemId:        stockCountItemsTable.id,
      productId:     stockCountItemsTable.productId,
      productName:   stockCountItemsTable.productName,
      productCategory: stockCountItemsTable.productCategory,
      systemCount:   stockCountItemsTable.systemCount,
      physicalCount: stockCountItemsTable.physicalCount,
      discrepancy:   stockCountItemsTable.discrepancy,
      barcode:       productsTable.barcode,
    })
    .from(stockCountItemsTable)
    .leftJoin(productsTable, and(
      eq(productsTable.id, stockCountItemsTable.productId),
      eq(productsTable.tenantId, tenantId),
    ))
    .where(eq(stockCountItemsTable.sessionId, sessionId))
    .orderBy(stockCountItemsTable.productCategory, stockCountItemsTable.productName);

  const header = ["productId","productName","barcode","category","systemCount","physicalCount","discrepancy"];
  const lines = [header.join(",")];
  for (const r of items) {
    lines.push([
      r.productId,
      r.productName,
      r.barcode ?? "",
      r.productCategory ?? "",
      r.systemCount,
      r.physicalCount ?? "",
      r.discrepancy ?? "",
    ].map(csvEscape).join(","));
  }

  const filename = `stock-count-${sessionId}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(lines.join("\r\n") + "\r\n");
});

/* ─── Bulk Stock Count: CSV import ─── */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch === "\r") { /* skip */ }
      else { cur += ch; }
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ""));
}

const ImportBody = z.object({ csv: z.string().min(1).max(2_000_000) });

router.post("/accounting/stock-counts/:id/import", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessionId = parseInt(req.params["id"] ?? "0", 10);
  const parsed = ImportBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const [session] = await db.select().from(stockCountSessionsTable)
    .where(and(eq(stockCountSessionsTable.id, sessionId), eq(stockCountSessionsTable.tenantId, tenantId)));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (session.status === "completed" || session.status === "voided") {
    res.status(400).json({ error: `Session is ${session.status}, cannot import` });
    return;
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length < 2) { res.status(400).json({ error: "CSV has no data rows" }); return; }

  const header = rows[0]!.map(h => h.trim().toLowerCase());
  const idxProductId = header.indexOf("productid");
  const idxBarcode   = header.indexOf("barcode");
  const idxPhysical  = header.indexOf("physicalcount");
  if (idxPhysical < 0 || (idxProductId < 0 && idxBarcode < 0)) {
    res.status(400).json({ error: "CSV must have a physicalCount column and either productId or barcode" });
    return;
  }

  const items = await db.select().from(stockCountItemsTable)
    .where(eq(stockCountItemsTable.sessionId, sessionId));
  const byProduct = new Map(items.map(i => [i.productId, i]));

  // If matching by barcode, build a lookup from products in this tenant.
  let barcodeToProductId = new Map<string, number>();
  if (idxBarcode >= 0) {
    const prods = await db
      .select({ id: productsTable.id, barcode: productsTable.barcode })
      .from(productsTable)
      .where(eq(productsTable.tenantId, tenantId));
    for (const p of prods) {
      if (p.barcode) barcodeToProductId.set(p.barcode.trim(), p.id);
    }
  }

  let updated = 0;
  let skipped = 0;
  const unmatched: Array<{ row: number; reason: string; productId?: number; barcode?: string }> = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]!;
    const physRaw = (cols[idxPhysical] ?? "").trim();
    if (physRaw === "") { skipped++; continue; }
    const physical = parseInt(physRaw, 10);
    if (!Number.isFinite(physical) || physical < 0) {
      unmatched.push({ row: r + 1, reason: `Invalid physicalCount "${physRaw}"` });
      continue;
    }

    let productId: number | null = null;
    if (idxProductId >= 0) {
      const pidRaw = (cols[idxProductId] ?? "").trim();
      const pid = parseInt(pidRaw, 10);
      if (Number.isFinite(pid) && pid > 0) productId = pid;
    }
    if (productId === null && idxBarcode >= 0) {
      const bc = (cols[idxBarcode] ?? "").trim();
      if (bc) productId = barcodeToProductId.get(bc) ?? null;
      if (productId === null && bc) {
        unmatched.push({ row: r + 1, reason: "Barcode not found", barcode: bc });
        continue;
      }
    }
    if (productId === null) { unmatched.push({ row: r + 1, reason: "Missing productId/barcode" }); continue; }

    const item = byProduct.get(productId);
    if (!item) { unmatched.push({ row: r + 1, reason: "Product not in this count session", productId }); continue; }
    if (item.isAdjusted) { skipped++; continue; }

    const discrepancy = physical - item.systemCount;
    await db.update(stockCountItemsTable)
      .set({ physicalCount: physical, discrepancy })
      .where(eq(stockCountItemsTable.id, item.id));
    updated++;
  }

  res.json({ updated, skipped, unmatched, totalRows: rows.length - 1 });
});

/* ─── Stock Variance Report ─── */
router.get("/accounting/reports/stock-variance", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const fromStr = String(req.query["from"] ?? "");
  const toStr   = String(req.query["to"] ?? "");
  const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to   = toStr ? new Date(toStr) : new Date();
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: "Invalid from/to date" }); return;
  }
  // Make `to` end-of-day inclusive.
  to.setHours(23, 59, 59, 999);

  // Pull completed sessions in window.
  const sessions = await db.select().from(stockCountSessionsTable)
    .where(and(
      eq(stockCountSessionsTable.tenantId, tenantId),
      eq(stockCountSessionsTable.status, "completed"),
      gte(stockCountSessionsTable.completedAt, from),
      lte(stockCountSessionsTable.completedAt, to),
    ))
    .orderBy(desc(stockCountSessionsTable.completedAt));

  if (sessions.length === 0) {
    res.json({
      from: from.toISOString(), to: to.toISOString(),
      summary: { sessionsRun: 0, itemsCounted: 0, totalDiscrepancies: 0,
        shrinkageUnits: 0, shrinkageValue: 0, overageUnits: 0, overageValue: 0,
        netUnits: 0, netValue: 0 },
      byCategory: [], topVariances: [], sessions: [],
    });
    return;
  }

  const sessionIds = sessions.map(s => s.id);
  const items = await db.select().from(stockCountItemsTable)
    .where(and(
      inArray(stockCountItemsTable.sessionId, sessionIds),
      // Only items that were actually counted (have a physical value).
      isNotNull(stockCountItemsTable.physicalCount),
    ));

  // Aggregations
  let itemsCounted = 0;
  let totalDiscrepancies = 0;
  let shrinkageUnits = 0, shrinkageValue = 0;
  let overageUnits = 0, overageValue = 0;

  type CatAgg = { category: string; items: number; discrepancies: number;
    shrinkageUnits: number; shrinkageValue: number;
    overageUnits: number; overageValue: number; netUnits: number; netValue: number };
  const catMap = new Map<string, CatAgg>();

  type SessionAgg = { sessionId: number; shrinkageValue: number; overageValue: number; discrepancies: number };
  const sessAgg = new Map<number, SessionAgg>();

  type TopRow = { productId: number; productName: string; category: string | null;
    systemCount: number; physicalCount: number; discrepancy: number;
    unitCost: number; absValue: number; signedValue: number;
    sessionId: number; sessionName: string; completedAt: Date | null };
  const topRows: TopRow[] = [];
  const sessionNameById = new Map(sessions.map(s => [s.id, s.name]));
  const sessionCompletedById = new Map(sessions.map(s => [s.id, s.completedAt]));

  for (const it of items) {
    if (it.physicalCount === null) continue;
    itemsCounted++;
    const disc = it.discrepancy ?? 0;
    const cost = it.unitCost ?? 0;
    const cat  = it.productCategory ?? "Uncategorized";

    if (!catMap.has(cat)) {
      catMap.set(cat, { category: cat, items: 0, discrepancies: 0,
        shrinkageUnits: 0, shrinkageValue: 0, overageUnits: 0, overageValue: 0,
        netUnits: 0, netValue: 0 });
    }
    const c = catMap.get(cat)!;
    c.items++;

    if (!sessAgg.has(it.sessionId)) {
      sessAgg.set(it.sessionId, { sessionId: it.sessionId, shrinkageValue: 0, overageValue: 0, discrepancies: 0 });
    }
    const sa = sessAgg.get(it.sessionId)!;

    if (disc !== 0) {
      totalDiscrepancies++;
      c.discrepancies++;
      sa.discrepancies++;
      const val = Math.abs(disc) * cost;
      if (disc < 0) {
        shrinkageUnits += Math.abs(disc); shrinkageValue += val;
        c.shrinkageUnits += Math.abs(disc); c.shrinkageValue += val;
        sa.shrinkageValue += val;
      } else {
        overageUnits += disc; overageValue += val;
        c.overageUnits += disc; c.overageValue += val;
        sa.overageValue += val;
      }
      c.netUnits += disc; c.netValue += disc * cost;

      // Each (session, product) is its own row — most useful for spotting
      // recurring shortages of the same item across multiple counts.
      const signedValue = disc * cost;
      topRows.push({
        productId: it.productId,
        productName: it.productName,
        category: it.productCategory,
        systemCount: it.systemCount,
        physicalCount: it.physicalCount,
        discrepancy: disc,
        unitCost: cost,
        absValue: Math.abs(signedValue),
        signedValue,
        sessionId: it.sessionId,
        sessionName: sessionNameById.get(it.sessionId) ?? "",
        completedAt: sessionCompletedById.get(it.sessionId) ?? null,
      });
    }
  }

  const topVariances = topRows
    .sort((a, b) => b.absValue - a.absValue || Math.abs(b.discrepancy) - Math.abs(a.discrepancy))
    .slice(0, 20);

  const byCategory = Array.from(catMap.values())
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const sessionsOut = sessions.map(s => {
    const a = sessAgg.get(s.id);
    return {
      id: s.id,
      name: s.name,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      totalItems: s.totalItems,
      totalDiscrepancies: s.totalDiscrepancies ?? a?.discrepancies ?? 0,
      shrinkageValue: a?.shrinkageValue ?? 0,
      overageValue: a?.overageValue ?? 0,
    };
  });

  res.json({
    from: from.toISOString(),
    to: to.toISOString(),
    summary: {
      sessionsRun: sessions.length,
      itemsCounted,
      totalDiscrepancies,
      shrinkageUnits,
      shrinkageValue,
      overageUnits,
      overageValue,
      netUnits: overageUnits - shrinkageUnits,
      netValue: overageValue - shrinkageValue,
    },
    byCategory,
    topVariances,
    sessions: sessionsOut,
  });
});

export default router;
