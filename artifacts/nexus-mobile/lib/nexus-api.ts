import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Thin, token-aware fetch helper for NEXXUS POS endpoints that are NOT part of
 * the generated `@workspace/api-client-react` client. Keeping these here avoids
 * mutating the shared OpenAPI spec (which would regenerate the web client).
 *
 * For every endpoint that DOES exist in the generated client (products, orders,
 * dashboard, customers, reports, cash, settings, staff/authenticate) use the
 * generated React Query hooks instead.
 */

export const TOKEN_KEY = "nexus_tenant_token";
export const TENANT_KEY = "nexus_tenant_info";

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export async function setToken(token: string | null): Promise<void> {
  _token = token;
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadToken(): Promise<string | null> {
  _token = await AsyncStorage.getItem(TOKEN_KEY);
  return _token;
}

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (_token) headers.authorization = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ───────────── Auth ───────────── */

export interface LoginResponse {
  token: string;
  tenant: {
    id: number;
    businessName: string;
    email: string;
    onboardingStep?: number | null;
    onboardingComplete?: boolean | null;
    emailVerified?: boolean | null;
  };
  subscription?: { status?: string; planId?: string | null; trialEndsAt?: string | null } | null;
  adminUser?: { id?: number; name?: string; email?: string; isPrimary?: boolean };
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/saas/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

/* ───────────── Payment methods ───────────── */

export interface PaymentMethod {
  id: number;
  tenantId: number;
  name: string;
  type: "cash" | "card" | "split" | "credit" | "digital" | "custom";
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/** Tenant-configured payment methods (cash, card, credit, split, and custom names like Cheque / Bank Transfer). */
export function listPaymentMethods(): Promise<PaymentMethod[]> {
  return request<PaymentMethod[]>("/api/payment-methods");
}

/* ───────────── Gift vouchers ───────────── */

export interface VoucherLookupResult {
  id: number;
  code: string;
  originalValue: number;
  balance: number;
  status: string;
  expiryDate?: string | null;
  customerName?: string | null;
}

/** Look up a gift voucher by code for redemption as a tender at checkout. Online only. */
export function lookupGiftVoucher(code: string): Promise<VoucherLookupResult> {
  return request<VoucherLookupResult>(
    `/api/gift-vouchers/lookup/${encodeURIComponent(code.trim().toUpperCase().replace(/\s+/g, ""))}`,
    { cache: "no-store" },
  );
}

/* ───────────── Stock counts ───────────── */

export interface StockCountSession {
  id: number;
  name: string;
  notes?: string | null;
  createdBy?: string | null;
  status: string;
  totalItems: number;
  totalDiscrepancies?: number | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface StockCountItem {
  id: number;
  sessionId: number;
  productId: number;
  productName: string;
  productCategory?: string | null;
  systemCount: number;
  physicalCount: number | null;
  discrepancy: number | null;
  unitCost?: number | null;
  isAdjusted: boolean;
}

export interface StockCountDetail extends StockCountSession {
  items: StockCountItem[];
}

export function listStockCounts(): Promise<StockCountSession[]> {
  return request<StockCountSession[]>("/api/accounting/stock-counts");
}

export function getStockCount(id: number): Promise<StockCountDetail> {
  return request<StockCountDetail>(`/api/accounting/stock-counts/${id}`);
}

export function createStockCount(body: {
  name: string;
  notes?: string;
  createdBy?: string;
  categoryFilter?: string;
}): Promise<StockCountSession & { itemCount: number }> {
  return request(`/api/accounting/stock-counts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchStockCountItem(
  sessionId: number,
  itemId: number,
  physicalCount: number,
): Promise<StockCountItem> {
  return request<StockCountItem>(`/api/accounting/stock-counts/${sessionId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ physicalCount }),
  });
}

export function applyStockCount(
  id: number,
  createJournalEntries: boolean,
): Promise<{ adjusted: number; discrepancies: number; message: string }> {
  return request(`/api/accounting/stock-counts/${id}/apply`, {
    method: "POST",
    body: JSON.stringify({ createJournalEntries }),
  });
}

/* ───────────── Stock adjustments ───────────── */

export interface StockAdjustment {
  id: number;
  productId: number;
  productName: string;
  adjustmentType: "increase" | "decrease";
  quantity: number;
  reason: string;
  notes?: string | null;
  previousStock: number;
  newStock: number;
  createdBy?: string | null;
  createdAt: string;
}

export function listStockAdjustments(limit = 50): Promise<StockAdjustment[]> {
  return request<StockAdjustment[]>(`/api/accounting/stock-adjustments?limit=${limit}`);
}

export function createStockAdjustment(body: {
  productId: number;
  adjustmentType: "increase" | "decrease";
  quantity: number;
  reason: string;
  notes?: string;
  createJournalEntry?: boolean;
  createdBy?: string;
}): Promise<StockAdjustment> {
  return request<StockAdjustment>(`/api/accounting/stock-adjustments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/* ───────────── Volume pricing tiers & purchase/sale units ───────────── */

export interface PricingTier {
  id?: number;
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
}

export interface PurchaseUnit {
  id?: number;
  unitName: string;
  conversionFactor: number;
  isPurchase: boolean;
  isSale: boolean;
}

export function getPricingTiers(productId: number): Promise<PricingTier[]> {
  return request<PricingTier[]>(`/api/products/${productId}/pricing-tiers`);
}

export function replacePricingTiers(
  productId: number,
  tiers: { minQty: number; maxQty: number | null; unitPrice: number }[],
): Promise<PricingTier[]> {
  return request<PricingTier[]>(`/api/products/${productId}/pricing-tiers`, {
    method: "PUT",
    body: JSON.stringify({ tiers }),
  });
}

export function getPurchaseUnits(productId: number): Promise<PurchaseUnit[]> {
  return request<PurchaseUnit[]>(`/api/products/${productId}/purchase-units`);
}

export function replacePurchaseUnits(
  productId: number,
  units: { unitName: string; conversionFactor: number; isPurchase: boolean; isSale: boolean }[],
): Promise<PurchaseUnit[]> {
  return request<PurchaseUnit[]>(`/api/products/${productId}/purchase-units`, {
    method: "PUT",
    body: JSON.stringify({ units }),
  });
}

/* ───────────── Subscription (SaaS) ───────────── */

export interface SaasPlan {
  id: number;
  name: string;
  slug: string;
  description?: string;
  priceMonthly: number;
  priceAnnual: number;
  features?: string[];
  isActive?: boolean;
}

export interface SaasSubscription {
  id: number;
  tenantId: number;
  planId: number | null;
  status: string;
  provider?: string;
  billingCycle?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

export interface SaasMeResponse {
  tenant: { id: number; businessName: string; email: string };
  subscription?: SaasSubscription | null;
  plan?: SaasPlan | null;
  nextScheduledPayment?: {
    scheduledFor?: string;
    amount?: number;
    planName?: string;
    billingCycle?: string;
  } | null;
}

export function saasMe(): Promise<SaasMeResponse> {
  return request<SaasMeResponse>("/api/saas/me");
}

export function getPlans(): Promise<SaasPlan[]> {
  return request<SaasPlan[]>("/api/plans");
}
