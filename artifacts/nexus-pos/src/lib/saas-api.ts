const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export const TENANT_TOKEN_KEY = "nexus_tenant_token";
export const SUPERADMIN_TOKEN_KEY = "nexus_superadmin_token";

function tenantAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function superadminAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(SUPERADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
    throw new Error(err.error ?? resp.statusText);
  }
  return resp.json() as Promise<T>;
}

/* ─── Tenant Auth ─── */
export const saasRegister = (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string; country?: string }) =>
  api<{ token: string; tenant: Tenant }>("/saas/register", { method: "POST", body: JSON.stringify(data) });

export const saasLogin = (email: string, password: string) =>
  api<{ token: string; tenant: Tenant; subscription: Subscription }>("/saas/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const saasMe = () =>
  api<{ tenant: Tenant; subscription: Subscription; plan: Plan | null }>("/saas/me", { headers: tenantAuthHeaders() });

export const saasUpdateOnboarding = (step: number, fields: Record<string, unknown>) =>
  api<{ tenant: Tenant }>("/saas/onboarding", { method: "PATCH", body: JSON.stringify({ step, ...fields }), headers: tenantAuthHeaders() });

/* ─── Plans ─── */
export const getPlans = () => api<Plan[]>("/plans");

/* ─── Billing ─── */
export const createPayPalOrder = (planSlug: string, billingCycle: "monthly" | "annual") =>
  api<{ orderId: string; amount: number; plan: { name: string; slug: string } }>("/billing/paypal/create-order", {
    method: "POST",
    body: JSON.stringify({ planSlug, billingCycle }),
    headers: tenantAuthHeaders(),
  });

export const capturePayPalOrder = (orderId: string, planSlug: string, billingCycle: "monthly" | "annual") =>
  api<{ status: string; orderId: string }>("/billing/paypal/capture-order", {
    method: "POST",
    body: JSON.stringify({ orderId, planSlug, billingCycle }),
    headers: tenantAuthHeaders(),
  });

export const initiatePowerTranz = (data: {
  planSlug: string;
  billingCycle: "monthly" | "annual";
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardholderName: string;
  returnUrl: string;
}) =>
  api<{ approved: boolean; transactionId?: string; responseCode?: string }>("/billing/powertranz/initiate", {
    method: "POST",
    body: JSON.stringify(data),
    headers: tenantAuthHeaders(),
  });

/* ─── Superadmin ─── */
export const superadminLogin = (email: string, password: string) =>
  api<{ token: string }>("/superadmin/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const superadminStats = () =>
  api<{ totalTenants: number; activeSubscriptions: number; trialSubscriptions: number; mrr: number; arr: number; planBreakdown: { planName: string; count: number }[] }>("/superadmin/stats", {
    headers: superadminAuthHeaders(),
  });

export const superadminTenants = () =>
  api<TenantRow[]>("/superadmin/tenants", { headers: superadminAuthHeaders() });

export const superadminUpdateTenant = (id: number, data: { status?: string; subscriptionStatus?: string; planId?: number }) =>
  api<{ success: boolean }>(`/superadmin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: superadminAuthHeaders() });

/* ─── Types ─── */
export interface Tenant {
  id: number;
  businessName: string;
  ownerName: string;
  email: string;
  phone?: string;
  country?: string;
  status: string;
  onboardingStep: number;
  onboardingComplete: boolean;
}

export interface Subscription {
  id: number;
  tenantId: number;
  planId: number | null;
  status: string;
  provider?: string;
  billingCycle?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

export interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  maxStaff: number;
  maxProducts: number;
  maxLocations: number;
  features: string[];
}

export interface TenantRow extends Tenant {
  subscriptionStatus?: string;
  planId?: number;
  billingCycle?: string;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  planName?: string;
}
