import { Router, type IRouter } from "express";
import { db, topupTransactionsTable, topupWalletsTable, topupWalletLedgerTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { logAudit } from "./audit";
import { ProxyAgent, fetch as undiciFetch } from "undici";

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

let fixieDispatcher: ProxyAgent | null | undefined;
function getFixieDispatcher(): ProxyAgent | undefined {
  if (fixieDispatcher !== undefined) return fixieDispatcher ?? undefined;
  const url = process.env.FIXIE_URL;
  fixieDispatcher = url ? new ProxyAgent(url) : null;
  return fixieDispatcher ?? undefined;
}

async function dingFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const key = getDingKey();
  const headers: Record<string, string> = {
    "api_key": key,
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const url = `https://api.dingconnect.com/api/V1${path}`;
  const dispatcher = getFixieDispatcher();
  if (dispatcher) {
    try {
      // Use undici's own fetch so the ProxyAgent dispatcher is version-compatible.
      // Node 24's global fetch uses a different internal undici build and rejects
      // a dispatcher from the installed undici package.
      return await (undiciFetch(url, { ...opts, headers, dispatcher } as Parameters<typeof undiciFetch>[1]) as Promise<Response>);
    } catch {
      // Proxy unreachable — fall through to direct fetch below.
    }
  }
  return fetch(url, { ...opts, headers });
}

/**
 * Checks a Ding response for upstream errors (HTTP non-2xx OR an inline
 * `ErrorCodes` payload that Ding sometimes returns with a 200). Returns a
 * human-readable message, or null if the call was healthy.
 */
function extractDingError(status: number, data: unknown): string | null {
  const d = data as {
    ErrorCodes?: { Code?: string; Context?: string | null }[];
    Errors?: { Code?: string; Message?: string }[];
    ResultCode?: number;
  } | null;
  const err = d?.ErrorCodes?.[0] ?? null;
  if (err?.Code) return err.Context ? `${err.Code}: ${err.Context}` : err.Code;
  const sendErr = d?.Errors?.[0];
  if (sendErr?.Message) return sendErr.Message;
  if (status < 200 || status >= 300) return `Ding API returned HTTP ${status}`;
  return null;
}

/* ─── Provider categorisation (top-up vs plans vs gift cards) ───────────
   Ding exposes every product — mobile credit, mobile bundles and brand gift
   cards — through the same GetProviders/GetProducts endpoints with no explicit
   "type" field. We classify each PROVIDER by the Benefits of its products:
     • any product with a "DigitalProduct" benefit  → gift card brand
     • else any product with a "Data" benefit        → mobile plan / bundle
     • else (Mobile / Minutes / Voice / SMS)         → plain mobile top-up
   A single country-wide GetProducts call returns all products, so we build the
   whole provider→category map in one request and cache it per country. */
export type TopupCategory = "topup" | "plans" | "giftcards";

function classifyBenefits(benefits: Set<string>): TopupCategory {
  if (benefits.has("digitalproduct")) return "giftcards";
  if (benefits.has("data")) return "plans";
  return "topup";
}

/* Pull a gift-card redemption code / PIN / URL out of a Ding transfer
   response. Ding places these under the transfer record's ReceiptText or a
   Redemption block; shapes vary by brand, so we probe the known locations and
   fall back to any string that looks like a code. */
function extractRedemptionInfo(data: Record<string, unknown>): string | null {
  const rec = (data.TransferRecord ?? data) as Record<string, unknown>;
  const candidates: unknown[] = [
    rec.ReceiptText,
    rec.RedemptionText,
    (rec.Redemption as Record<string, unknown> | undefined)?.Code,
    (rec.Redemption as Record<string, unknown> | undefined)?.Pin,
    (rec.Redemption as Record<string, unknown> | undefined)?.Url,
    rec.PinCode,
    rec.Pin,
  ];
  const parts: string[] = [];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) parts.push(c.trim());
  }
  return parts.length ? Array.from(new Set(parts)).join("\n") : null;
}

const CATEGORY_TTL_MS = 30 * 60 * 1000;
const providerCategoryCache = new Map<string, { at: number; map: Map<string, Set<TopupCategory>> }>();

/* Build a provider → set-of-categories map. A provider is classified per
   PRODUCT (not by aggregating all its benefits), so a carrier that sells both
   airtime and data bundles appears under BOTH the Top-up and Plans sub-modes
   instead of being forced into a single bucket. */
async function getProviderCategories(countryIso: string): Promise<Map<string, Set<TopupCategory>>> {
  const cached = providerCategoryCache.get(countryIso);
  if (cached && Date.now() - cached.at < CATEGORY_TTL_MS) return cached.map;
  const r = await dingFetch(`/GetProducts?countryIsos[0]=${encodeURIComponent(countryIso)}`);
  const d = await r.json() as Record<string, unknown>;
  if (extractDingError(r.status, d)) return cached?.map ?? new Map();
  const items = Array.isArray(d.Items) ? d.Items as Record<string, unknown>[] : [];
  const map = new Map<string, Set<TopupCategory>>();
  for (const p of items) {
    const code = p.ProviderCode as string | undefined;
    if (!code) continue;
    const benefits = Array.isArray(p.Benefits)
      ? (p.Benefits as unknown[]).map((b) => String((b as Record<string, unknown>)?.BenefitType ?? b).toLowerCase())
      : [];
    const cat = classifyBenefits(new Set(benefits));
    let set = map.get(code);
    if (!set) { set = new Set(); map.set(code, set); }
    set.add(cat);
  }
  providerCategoryCache.set(countryIso, { at: Date.now(), map });
  return map;
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

export async function creditWallet(tenantId: number, amount: number, description: string, referenceId?: string): Promise<number> {
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
  if (!getDingKey()) { res.status(503).json({ error: "Ding API key not configured" }); return; }
  try {
    const r = await dingFetch("/GetCountries");
    const data = await r.json() as Record<string, unknown>;
    const upstreamErr = extractDingError(r.status, data);
    if (upstreamErr) {
      res.status(r.status === 401 ? 502 : (r.status >= 400 ? r.status : 502))
        .json({ error: `Ding: ${upstreamErr}`, upstream: data });
      return;
    }
    // Ding returns Items with CountryIso/CountryName; frontend expects Countries with Iso/Name
    const raw = Array.isArray(data.Items) ? data.Items as Record<string, unknown>[] : (Array.isArray(data.Countries) ? data.Countries as Record<string, unknown>[] : []);
    data.Countries = raw.map(c => ({
      Iso: c.CountryIso ?? c.Iso,
      Name: c.CountryName ?? c.Name,
      RegionCode: Array.isArray(c.RegionCodes) ? (c.RegionCodes as string[])[0] : c.RegionCode,
    }));
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch countries", details: String(err) });
  }
});

router.get("/topup/operators", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!getDingKey()) { res.status(503).json({ error: "Ding API key not configured" }); return; }
  const { countryIso } = req.query as { countryIso?: string };
  try {
    const params = new URLSearchParams();
    if (countryIso) params.append("countryIsos[0]", countryIso);
    const r = await dingFetch(`/GetProviders?${params.toString()}`);
    const data = await r.json() as Record<string, unknown>;
    const upstreamErr = extractDingError(r.status, data);
    if (upstreamErr) {
      res.status(r.status === 401 ? 502 : (r.status >= 400 ? r.status : 502))
        .json({ error: `Ding: ${upstreamErr}`, upstream: data });
      return;
    }
    // Ding API returns Items; frontend expects Providers
    const providers = (data.Providers as Record<string, unknown>[] | undefined) ?? (Array.isArray(data.Items) ? data.Items as Record<string, unknown>[] : []);
    // Tag each provider with its category (top-up / plan / gift card) so the
    // frontend can split them into the Top-Up and Gift Cards sections.
    if (countryIso && providers.length) {
      try {
        const catMap = await getProviderCategories(countryIso);
        data.Providers = providers.map((p) => {
          const cats = catMap.get(p.ProviderCode as string);
          const list = cats && cats.size ? Array.from(cats) : (["topup"] as TopupCategory[]);
          return { ...p, Categories: list, Category: list[0] };
        });
      } catch {
        data.Providers = providers;
      }
    } else {
      data.Providers = providers;
    }
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch operators", details: String(err) });
  }
});

/* Carrier lookup for a recipient number. Ding's GetProviders accepts an
   accountNumber and returns only the provider(s) whose number ranges match it,
   so we can confirm the entered number belongs to the selected carrier (a
   number can only be registered to one carrier). Degrades gracefully: any
   upstream error returns an empty provider list rather than blocking. */
router.get("/topup/lookup", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!getDingKey()) { res.status(503).json({ error: "Ding API key not configured" }); return; }
  const { countryIso, accountNumber } = req.query as { countryIso?: string; accountNumber?: string };
  if (!accountNumber) { res.status(400).json({ error: "accountNumber is required" }); return; }
  try {
    const params = new URLSearchParams();
    if (countryIso) params.append("countryIsos[0]", countryIso);
    params.append("accountNumber", accountNumber);
    const r = await dingFetch(`/GetProviders?${params.toString()}`);
    const data = await r.json() as Record<string, unknown>;
    const upstreamErr = extractDingError(r.status, data);
    if (upstreamErr) {
      // Non-fatal: return no matches so the UI shows "couldn't confirm" rather
      // than a hard error that blocks an otherwise-valid send.
      res.json({ providers: [], note: upstreamErr });
      return;
    }
    const providers = (data.Providers as Record<string, unknown>[] | undefined) ?? (Array.isArray(data.Items) ? data.Items as Record<string, unknown>[] : []);
    res.json({
      providers: providers.map((p) => ({ ProviderCode: p.ProviderCode, Name: p.Name })),
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to look up carrier", details: String(err) });
  }
});

router.get("/topup/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!getDingKey()) { res.status(503).json({ error: "Ding API key not configured" }); return; }
  const { operatorId } = req.query as { operatorId?: string };
  if (!operatorId) { res.status(400).json({ error: "operatorId is required" }); return; }
  try {
    const params = new URLSearchParams();
    params.append("providerCodes[0]", operatorId);
    const r = await dingFetch(`/GetProducts?${params.toString()}`);
    const data = await r.json() as Record<string, unknown>;
    const upstreamErr = extractDingError(r.status, data);
    if (upstreamErr) {
      res.status(r.status === 401 ? 502 : (r.status >= 400 ? r.status : 502))
        .json({ error: `Ding: ${upstreamErr}`, upstream: data });
      return;
    }
    // Ding returns Items with nested Maximum/Minimum objects; normalize to frontend shape
    const rawItems = Array.isArray(data.Items) ? data.Items as Record<string, unknown>[] : [];
    data.Products = rawItems.map(p => {
      const max = (p.Maximum ?? {}) as Record<string, unknown>;
      const min = (p.Minimum ?? {}) as Record<string, unknown>;
      const sendValue = (max.SendValue ?? min.SendValue ?? 0) as number;
      const sendCurrencyIso = (max.SendCurrencyIso ?? min.SendCurrencyIso ?? "USD") as string;
      const receiveCurrencyIso = (max.ReceiveCurrencyIso ?? min.ReceiveCurrencyIso ?? "") as string;
      const receiveValue = (max.ReceiveValue ?? min.ReceiveValue ?? 0) as number;
      const minSend = (min.SendValue ?? sendValue) as number;
      const maxSend = (max.SendValue ?? sendValue) as number;
      const minReceive = (min.ReceiveValue ?? receiveValue) as number;
      const maxReceive = (max.ReceiveValue ?? receiveValue) as number;
      const isRange = minSend !== maxSend;
      const benefits = Array.isArray(p.Benefits)
        ? (p.Benefits as unknown[]).map((b) => String((b as Record<string, unknown>)?.BenefitType ?? b).toLowerCase())
        : [];
      const productType = classifyBenefits(new Set(benefits));
      return {
        SkuCode: p.SkuCode,
        Name: p.DefaultDisplayText ?? p.SkuCode,
        ProductType: productType,
        RedemptionMechanism: (p.RedemptionMechanism ?? undefined) as string | undefined,
        SendValue: sendValue,
        SendCurrencyIso: sendCurrencyIso,
        ReceiveValue: receiveValue,
        ReceiverCurrencyIso: receiveCurrencyIso,
        IsRangeTopUp: isRange,
        Minimum: isRange ? minSend : undefined,
        Maximum: isRange ? maxSend : undefined,
        ReceiveValueMin: isRange ? minReceive : undefined,
        ReceiveValueMax: isRange ? maxReceive : undefined,
        ValidityDays: (p.ValidityDays ?? undefined) as number | undefined,
        LocalisedPrice: {
          CustomerFee: (max.CustomerFee ?? 0) as number,
          SenderFee: sendValue,
          CurrencyIso: sendCurrencyIso,
        },
      };
    });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch products", details: String(err) });
  }
});

/* ─── Diagnostics ─── */
router.get("/topup/diagnostics", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const key = getDingKey();
  if (!key) { res.json({ ok: false, reason: "DING_API_KEY not set" }); return; }
  try {
    const r = await dingFetch("/GetCountries");
    const data = await r.json() as unknown;
    const err = extractDingError(r.status, data);
    res.json({
      ok: !err,
      httpStatus: r.status,
      keyLength: key.length,
      keyPrefix: key.slice(0, 4),
      upstreamError: err,
      upstreamBody: err ? data : undefined,
    });
  } catch (err) {
    res.json({ ok: false, reason: "Network error reaching Ding", details: String(err) });
  }
});

/* Public network diagnostic: reports this server's outbound IP (needed to
   whitelist the server in the DingConnect dashboard) and, only when ?ding=1,
   whether the configured key authenticates. Returns no secrets. */
router.get("/topup/net-check", async (req, res): Promise<void> => {
  let outboundIp: string | null = null;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const d = await r.json() as { ip?: string };
    outboundIp = d.ip ?? null;
  } catch { /* ignore */ }

  let dingAuth: { ok: boolean; httpStatus?: number; error?: string | null } | null = null;
  if (req.query.ding === "1" && getDingKey()) {
    try {
      const r = await dingFetch("/GetBalance");
      const d = await r.json() as unknown;
      const err = extractDingError(r.status, d);
      dingAuth = { ok: !err, httpStatus: r.status, error: err };
    } catch (e) {
      dingAuth = { ok: false, error: String(e) };
    }
  }

  let dingCountries: { ok: boolean; httpStatus?: number; count?: number; keys?: string[]; sample?: unknown; error?: string | null } | null = null;
  if (req.query.countries === "1" && getDingKey()) {
    try {
      const r = await dingFetch("/GetCountries");
      const d = await r.json() as Record<string, unknown>;
      const err = extractDingError(r.status, d);
      const items = Array.isArray(d?.Items) ? d.Items as unknown[] : (Array.isArray(d?.Countries) ? d.Countries as unknown[] : []);
      dingCountries = { ok: !err, httpStatus: r.status, count: items.length, keys: Object.keys(d ?? {}), resultCode: d?.ResultCode, errorCodes: d?.ErrorCodes, sample: items.slice(0, 2), error: err };
    } catch (e) {
      dingCountries = { ok: false, error: String(e) };
    }
  }

  let dingProviders: { ok: boolean; httpStatus?: number; count?: number; itemKeys?: string[]; sample?: unknown; error?: string | null } | null = null;
  if (req.query.providers === "1" && getDingKey()) {
    try {
      const r = await dingFetch("/GetProviders?countryIsos[0]=JM");
      const d = await r.json() as Record<string, unknown>;
      const err = extractDingError(r.status, d);
      const items = Array.isArray(d?.Items) ? d.Items as Record<string, unknown>[] : [];
      const mobile = items.filter((p) => /digicel|flow|lime/i.test(String(p.Name ?? "")));
      dingProviders = { ok: !err, httpStatus: r.status, count: items.length, itemKeys: items[0] ? Object.keys(items[0]) : [], sample: (mobile.length ? mobile : items).slice(0, 3), error: err };
    } catch (e) { dingProviders = { ok: false, error: String(e) }; }
  }

  let dingProducts: { ok: boolean; httpStatus?: number; count?: number; itemKeys?: string[]; sample?: unknown; error?: string | null } | null = null;
  if (req.query.products === "1" && getDingKey()) {
    // Get the first JM provider code then fetch its products
    try {
      const pr = await dingFetch("/GetProviders?countryIsos[0]=JM");
      const pd = await pr.json() as Record<string, unknown>;
      const providers = Array.isArray(pd?.Items) ? pd.Items as Record<string, unknown>[] : [];
      const mobile = providers.find((p) => /digicel|flow/i.test(String(p.Name ?? ""))) ?? providers[0];
      const code = mobile?.ProviderCode as string | undefined;
      if (code) {
        const r = await dingFetch(`/GetProducts?providerCodes[0]=${encodeURIComponent(code)}`);
        const d = await r.json() as Record<string, unknown>;
        const err = extractDingError(r.status, d);
        const items = Array.isArray(d?.Items) ? d.Items as Record<string, unknown>[] : [];
        dingProducts = { ok: !err, httpStatus: r.status, count: items.length, itemKeys: items[0] ? Object.keys(items[0]) : [], sample: items.slice(0, 1), error: err };
      }
    } catch (e) { dingProducts = { ok: false, error: String(e) }; }
  }

  res.json({ outboundIp, dingConfigured: !!getDingKey(), dingAuth, dingCountries, dingProviders, dingProducts });
});

/* ─── SEND TOP-UP ─── */

router.post("/topup/send", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { phoneNumber, countryCode, operatorId, operatorName, productSkuCode, productName, sendValue, sendCurrency, benefitValue, benefitCurrency, cost, staffId, staffName, productType: rawProductType, dingSendValue, dingSendCurrency } = req.body as {
    phoneNumber: string; countryCode: string; operatorId: string; operatorName: string;
    productSkuCode: string; productName: string; sendValue: number; sendCurrency: string;
    benefitValue: number; benefitCurrency: string; cost: number; staffId?: number; staffName?: string;
    productType?: TopupCategory; dingSendValue?: number; dingSendCurrency?: string;
  };

  const productType: TopupCategory = rawProductType === "giftcards" || rawProductType === "plans" ? rawProductType : "topup";
  const isGiftCard = productType === "giftcards";

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
    status: "pending", productType, staffId: staffId ?? null, staffName: staffName ?? null,
  }).returning();

  if (!getDingKey()) {
    await db.update(topupTransactionsTable)
      .set({ status: "failed", errorMessage: "Ding API key not configured", updatedAt: new Date() })
      .where(eq(topupTransactionsTable.id, txn.id));
    res.status(503).json({ error: "Ding API key not configured. Please contact support." }); return;
  }

  try {
    // Gift-card SKUs are fixed-value and require the SendValue/currency in the
    // request (mobile top-up SKUs must NOT include it). Everything else mirrors
    // the mobile flow — the phone number is the delivery account for both.
    const body: Record<string, unknown> = {
      AccountNumber: phoneNumber,
      ProductSkuCode: productSkuCode,
      DistributorRef: distributorRef,
      ValidateOnly: false,
    };
    if (isGiftCard) {
      if (dingSendValue) body.SendValue = dingSendValue;
      if (dingSendCurrency) body.SendCurrencyIso = dingSendCurrency;
    }
    const dingRes = await dingFetch("/SendTransfer", { method: "POST", body: JSON.stringify(body) });
    const dingData = await dingRes.json() as {
      Errors?: { Code: string; Message: string }[];
      ErrorCodes?: { Code: string; Context?: string }[];
      ResultCode?: number;
      TransferId?: string;
      TransferStatus?: number;
      TransferRecord?: Record<string, unknown>;
    };

    const hasError = !dingRes.ok
      || (dingData.Errors && dingData.Errors.length > 0)
      || (dingData.ErrorCodes && dingData.ErrorCodes.length > 0)
      || (typeof dingData.ResultCode === "number" && dingData.ResultCode !== 1);
    if (hasError) {
      const errMsg = dingData.Errors?.[0]?.Message
        ?? (dingData.ErrorCodes?.length ? `${dingData.ErrorCodes[0].Code} (${dingData.ErrorCodes[0].Context ?? ""})` : undefined)
        ?? `HTTP ${dingRes.status}`;
      await db.update(topupTransactionsTable)
        .set({ status: "failed", errorMessage: errMsg, updatedAt: new Date() })
        .where(eq(topupTransactionsTable.id, txn.id));
      res.status(400).json({ error: errMsg, transaction: { ...txn, status: "failed" } }); return;
    }

    // Gift cards return a redemption code / PIN inside the transfer record.
    const redemptionInfo = isGiftCard ? extractRedemptionInfo(dingData) : null;

    const commission = sendValue - deductAmount;
    const label = isGiftCard ? `Gift card ${productName}` : `Top-up ${phoneNumber} (${productName})`;
    const newBalance = await debitWallet(tenantId, deductAmount, label, String(txn.id));

    await db.update(topupTransactionsTable).set({
      dingTransactionId: dingData.TransferId ?? null,
      status: dingData.TransferStatus === 2 ? "pending" : "success",
      commissionEarned: commission > 0 ? commission : 0,
      redemptionInfo,
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

// DISABLED: this endpoint previously credited the wallet for free from a
// client-supplied amount (any authenticated tenant could mint unlimited credit).
// Real funding now goes through the paid flows in billing.ts
// (/billing/topup-wallet/{paypal,powertranz}/…). A superadmin-approved manual
// funding flow (bank transfer / cash) is planned for Phase 2.
router.post("/topup/wallet/fund", (_req, res): void => {
  res.status(403).json({ error: "Direct wallet funding is disabled. Use card or PayPal to add credit." });
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
