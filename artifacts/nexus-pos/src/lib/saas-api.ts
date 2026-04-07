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
  const resp = await fetch(`/api${path}`, {
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
    method: "POST", body: JSON.stringify({ planSlug, billingCycle }), headers: tenantAuthHeaders(),
  });

export const capturePayPalOrder = (orderId: string, planSlug: string, billingCycle: "monthly" | "annual") =>
  api<{ status: string; orderId: string }>("/billing/paypal/capture-order", {
    method: "POST", body: JSON.stringify({ orderId, planSlug, billingCycle }), headers: tenantAuthHeaders(),
  });

export const initiatePowerTranz = (data: { planSlug: string; billingCycle: "monthly" | "annual"; cardNumber: string; cardExpiry: string; cardCvv: string; cardholderName: string; returnUrl: string }) =>
  api<{ approved: boolean; transactionId?: string; responseCode?: string }>("/billing/powertranz/initiate", {
    method: "POST", body: JSON.stringify(data), headers: tenantAuthHeaders(),
  });

export const getBankAccounts = () =>
  api<BankAccount[]>("/billing/bank-accounts", { headers: tenantAuthHeaders() });

export const submitBankTransferProof = (data: {
  planSlug: string; billingCycle: "monthly" | "annual"; bankAccountId: number;
  referenceNumber?: string; notes?: string; proofFileName?: string; proofFileType?: string; proofFileData?: string;
}) =>
  api<{ success: boolean; proofId: number }>("/billing/bank-transfer", {
    method: "POST", body: JSON.stringify(data), headers: tenantAuthHeaders(),
  });

export const getMyBankTransferProofs = () =>
  api<BankTransferProofRow[]>("/billing/bank-transfer/my-proofs", { headers: tenantAuthHeaders() });

/* ─── Superadmin ─── */
export const superadminLogin = (email: string, password: string) =>
  api<{ token: string }>("/superadmin/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const superadminStats = () =>
  api<{ totalTenants: number; activeSubscriptions: number; trialSubscriptions: number; pendingProofs: number; mrr: number; arr: number; planBreakdown: { planName: string; count: number }[] }>("/superadmin/stats", {
    headers: superadminAuthHeaders(),
  });

export const superadminTenants = () =>
  api<TenantRow[]>("/superadmin/tenants", { headers: superadminAuthHeaders() });

export const superadminCreateTenant = (data: {
  businessName: string; ownerName: string; email: string; password: string;
  phone?: string; country?: string; planSlug?: string; billingCycle?: "monthly" | "annual"; subscriptionStatus?: string;
}) =>
  api<{ success: boolean; tenant: { id: number; email: string } }>("/superadmin/tenants", {
    method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders(),
  });

export const superadminUpdateTenant = (id: number, data: { status?: string; subscriptionStatus?: string; planId?: number }) =>
  api<{ success: boolean }>(`/superadmin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: superadminAuthHeaders() });

export const superadminGetBankAccounts = () =>
  api<BankAccount[]>("/superadmin/bank-accounts", { headers: superadminAuthHeaders() });

export const superadminCreateBankAccount = (data: Omit<BankAccount, "id">) =>
  api<BankAccount>("/superadmin/bank-accounts", { method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders() });

export const superadminUpdateBankAccount = (id: number, data: Partial<Omit<BankAccount, "id">>) =>
  api<BankAccount>(`/superadmin/bank-accounts/${id}`, { method: "PUT", body: JSON.stringify(data), headers: superadminAuthHeaders() });

export const superadminDeleteBankAccount = (id: number) =>
  api<{ success: boolean }>(`/superadmin/bank-accounts/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

export const superadminGetTransferProofs = () =>
  api<TransferProofRow[]>("/superadmin/bank-transfer-proofs", { headers: superadminAuthHeaders() });

export const superadminReviewTransferProof = (id: number, status: "approved" | "rejected", reviewNotes?: string) =>
  api<{ success: boolean }>(`/superadmin/bank-transfer-proofs/${id}`, {
    method: "PATCH", body: JSON.stringify({ status, reviewNotes }), headers: superadminAuthHeaders(),
  });

export const superadminGetUsers = (q?: string) =>
  api<UserRow[]>(`/superadmin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: superadminAuthHeaders() });

export const superadminImpersonate = (tenantId: number) =>
  api<{ token: string; tenant: { id: number; email: string; businessName: string } }>(`/superadmin/tenants/${tenantId}/impersonate`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export const superadminResetPassword = (tenantId: number, newPassword: string) =>
  api<{ success: boolean }>(`/superadmin/tenants/${tenantId}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), headers: superadminAuthHeaders(),
  });

/* ─── Types ─── */
export interface Tenant {
  id: number; businessName: string; ownerName: string; email: string; phone?: string;
  country?: string; status: string; onboardingStep: number; onboardingComplete: boolean;
}

export interface Subscription {
  id: number; tenantId: number; planId: number | null; status: string;
  provider?: string; billingCycle?: string; trialEndsAt?: string; currentPeriodEnd?: string;
}

export interface Plan {
  id: number; name: string; slug: string; description: string;
  priceMonthly: number; priceAnnual: number; maxStaff: number; maxProducts: number; maxLocations: number; features: string[];
}

export interface TenantRow extends Tenant {
  subscriptionStatus?: string; planId?: number; billingCycle?: string;
  currentPeriodEnd?: string; trialEndsAt?: string; planName?: string;
}

export interface BankAccount {
  id: number; accountHolder: string; bankName: string; accountNumber: string;
  routingNumber?: string; iban?: string; swiftCode?: string; currency: string;
  instructions?: string; isActive?: boolean; sortOrder?: number;
}

export interface BankTransferProofRow {
  id: number; planId: number | null; billingCycle: string; amount: number;
  referenceNumber?: string; proofFileName?: string; status: string; reviewNotes?: string;
  createdAt: string; planName?: string;
}

export interface TransferProofRow {
  id: number; tenantId: number; planId: number | null; bankAccountId: number | null;
  billingCycle: string; amount: number; referenceNumber?: string; notes?: string;
  proofFileName?: string; proofFileType?: string; proofFileData?: string;
  status: string; reviewNotes?: string; reviewedAt?: string; createdAt: string;
  businessName?: string; ownerName?: string; email?: string; planName?: string;
  bankName?: string; accountHolder?: string;
}

export interface UserRow {
  id: number; businessName: string; ownerName: string; email: string;
  phone?: string; country?: string; status: string;
  onboardingComplete: boolean; createdAt: string;
  subscriptionStatus?: string; planName?: string; billingCycle?: string;
}
