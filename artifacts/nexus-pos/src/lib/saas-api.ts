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

export class ApiError extends Error {
  public readonly body: Record<string, unknown>;
  public readonly status: number;
  constructor(msg: string, body: Record<string, unknown>, status: number) {
    super(msg);
    this.name = "ApiError";
    this.body = body;
    this.status = status;
  }
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options ?? {};
  const resp = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...optHeaders },
    ...restOptions,
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText })) as Record<string, unknown>;
    const msg = [body["error"], body["details"]].filter(Boolean).join(" — ");
    throw new ApiError(msg || resp.statusText, body, resp.status);
  }
  return resp.json() as Promise<T>;
}

/* ─── Tenant Auth ─── */
export const saasRegister = (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string; country?: string; acceptedTerms: boolean }) =>
  api<{ token: string; tenant: Tenant }>("/saas/register", { method: "POST", body: JSON.stringify(data) });

export const saasLogin = (email: string, password: string) =>
  api<{ token: string; tenant: Tenant; subscription: Subscription }>("/saas/login", { method: "POST", body: JSON.stringify({ email, password }) });

export interface NextScheduledPayment {
  id: number;
  planId: number;
  planName: string | null;
  billingCycle: string;
  amount: number;
  scheduledStartDate: string;
  scheduledEndDate: string;
}

export const saasMe = () =>
  api<{ tenant: Tenant; subscription: Subscription; plan: Plan | null; nextScheduledPayment: NextScheduledPayment | null }>("/saas/me", { headers: tenantAuthHeaders() });

export const saasUpdateOnboarding = (step: number, fields: Record<string, unknown>) =>
  api<{ tenant: Tenant }>("/saas/onboarding", { method: "PATCH", body: JSON.stringify({ step, ...fields }), headers: tenantAuthHeaders() });

/* ─── My Account (self-service) ─── */
export const saasUpdateProfile = (data: { businessName?: string; ownerName?: string; phone?: string; address?: string; country?: string }) =>
  api<{ tenant: Tenant }>("/saas/account/profile", { method: "PATCH", body: JSON.stringify(data), headers: tenantAuthHeaders() });

export const saasUpdateEmail = (newEmail: string, currentPassword: string) =>
  api<{ success: boolean; token: string; email: string }>("/saas/account/email", {
    method: "PATCH", body: JSON.stringify({ newEmail, currentPassword }), headers: tenantAuthHeaders(),
  });

export const saasUpdatePassword = (currentPassword: string, newPassword: string) =>
  api<{ success: boolean; token: string }>("/saas/account/password", {
    method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }), headers: tenantAuthHeaders(),
  });

export const createFirstStaff = (data: { name: string; pin: string; role: string }) =>
  api<{ id: number; name: string; role: string }>("/staff", {
    method: "POST",
    body: JSON.stringify(data),
    headers: tenantAuthHeaders(),
  });

/* ─── Business Profile (multi-industry) ─── */
export type BusinessType = "restaurant" | "retail" | "wholesale" | "hybrid";
export interface FeatureCatalogEntry { key: string; label: string; category: string }
export interface BusinessProfile {
  tenantId: number;
  businessName: string;
  businessType: BusinessType;
  features: Record<string, boolean>;
  catalog: FeatureCatalogEntry[];
}

export const getBusinessProfile = () =>
  api<BusinessProfile>("/business-profile", { headers: tenantAuthHeaders() });

export const setBusinessType = (businessType: BusinessType) =>
  api<{ businessType: BusinessType; features: Record<string, boolean> }>("/business-profile/type", {
    method: "PUT", body: JSON.stringify({ businessType }), headers: tenantAuthHeaders(),
  });

export const setBusinessFeature = (key: string, enabled: boolean) =>
  api<{ feature: string; enabled: boolean }>(`/business-profile/features/${encodeURIComponent(key)}`, {
    method: "PUT", body: JSON.stringify({ enabled }), headers: tenantAuthHeaders(),
  });

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
  api<{ step: "3ds" | "approved" | "declined"; spiToken?: string; redirectData?: string; approved?: boolean; transactionId?: string; rrn?: string; authCode?: string; responseCode?: string; responseMessage?: string }>("/billing/powertranz/initiate", {
    method: "POST", body: JSON.stringify(data), headers: tenantAuthHeaders(),
  });

export const getPowerTranz3dsStatus = (spiToken: string) =>
  api<{ status: "pending" | "approved" | "declined" | "not_found"; planName?: string; rrn?: string; message?: string }>(`/billing/powertranz/3ds-status?spiToken=${encodeURIComponent(spiToken)}`);

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

/* ─── Billing history (invoices / receipts) ─── */
export interface BillingInvoiceRow {
  id: number;
  invoiceNumber: string;
  receiptNumber: string;
  planName: string;
  billingCycle: string;
  amount: number;
  currency: string;
  provider: string;
  paymentMethodLabel: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string;
  issuedAt: string;
  emailedAt: string | null;
  emailStatus: string;
}

export const getBillingInvoices = () =>
  api<BillingInvoiceRow[]>("/billing/invoices", { headers: tenantAuthHeaders() });

export const resendBillingInvoice = (id: number) =>
  api<{ ok: boolean; email: string }>(`/billing/invoices/${id}/resend`, {
    method: "POST",
    headers: tenantAuthHeaders(),
  });

/**
 * Fetches a billing PDF (invoice or receipt) as a Blob so it can be opened or
 * downloaded. Auth is header-based, so a plain <a href> won't work.
 */
async function fetchBillingPdf(id: number, kind: "invoice" | "receipt"): Promise<Blob> {
  const resp = await fetch(`/api/billing/invoices/${id}/${kind}.pdf`, {
    headers: tenantAuthHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText })) as Record<string, unknown>;
    throw new ApiError(String(body["error"] ?? resp.statusText), body, resp.status);
  }
  return resp.blob();
}

export const openBillingPdf = async (id: number, kind: "invoice" | "receipt") => {
  const blob = await fetchBillingPdf(id, kind);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

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

export const superadminUpdateTenant = (id: number, data: { status?: string; subscriptionStatus?: string; planId?: number; billingCycle?: "monthly" | "annual" }) =>
  api<{ success: boolean }>(`/superadmin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: superadminAuthHeaders() });

/* ─── Superadmin Plan CRUD ─── */
type PlanInput = {
  name: string; slug: string; description?: string;
  priceMonthly: number; priceAnnual: number;
  maxStaff: number; maxProducts: number; maxLocations: number; maxInvoices: number;
  modules: string[]; features: string[]; isActive?: boolean;
  isPromotional?: boolean;
};
export const superadminGetPlans = () =>
  api<Plan[]>("/superadmin/plans", { headers: superadminAuthHeaders() });
export const superadminCreatePlan = (data: PlanInput) =>
  api<Plan>("/superadmin/plans", { method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminUpdatePlan = (id: number, data: Partial<PlanInput>) =>
  api<Plan>(`/superadmin/plans/${id}`, { method: "PUT", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminDeletePlan = (id: number) =>
  api<{ success: boolean }>(`/superadmin/plans/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

/* ─── Superadmin Coupons ─── */
export interface Coupon {
  id: number; code: string; planId: number; planName?: string | null;
  billingCycle: string; maxRedemptions: number; redemptionCount: number;
  expiresAt?: string | null; isActive: boolean; notes?: string | null;
  createdBy?: string; createdAt: string;
}
export interface CouponInput {
  code: string; planId: number; billingCycle: "monthly" | "annual";
  maxRedemptions: number; expiresAt?: string | null; isActive?: boolean; notes?: string;
}
export interface CouponRedemption {
  id: number; tenantId: number; businessName?: string | null; email?: string | null; redeemedAt: string;
}
export const superadminGetCoupons = () =>
  api<Coupon[]>("/superadmin/coupons", { headers: superadminAuthHeaders() });
export const superadminCreateCoupon = (data: CouponInput) =>
  api<Coupon>("/superadmin/coupons", { method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminUpdateCoupon = (id: number, data: Partial<Pick<CouponInput, "maxRedemptions" | "expiresAt" | "isActive" | "notes">>) =>
  api<Coupon>(`/superadmin/coupons/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminDeactivateCoupon = (id: number) =>
  api<{ success: boolean }>(`/superadmin/coupons/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });
export const superadminGetCouponRedemptions = (id: number) =>
  api<CouponRedemption[]>(`/superadmin/coupons/${id}/redemptions`, { headers: superadminAuthHeaders() });

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

export type GatewaySettings = {
  powertranz_spid: string;
  powertranz_sppassword: string;
  powertranz_sppassword_set?: string;
  powertranz_env: string;
  powertranz_enabled: string;
};

export const superadminGetGatewaySettings = () =>
  api<GatewaySettings>("/superadmin/gateway", { headers: superadminAuthHeaders() });

export const superadminUpdateGatewaySettings = (data: Partial<GatewaySettings>) =>
  api<{ success: boolean }>("/superadmin/gateway", {
    method: "PATCH", body: JSON.stringify(data), headers: superadminAuthHeaders(),
  });

/* ─── Superadmin Analytics & Usage Monitoring ─── */
export type AnalyticsActivityLabel = "active" | "moderate" | "low" | "dormant";
export type AnalyticsRiskLabel = "low" | "medium" | "high";

export interface AnalyticsOverview {
  totals: { tenants: number; activeSubscriptions: number; trialSubscriptions: number; pastDue: number; cancelled: number };
  activity: { activeToday: number; active7d: number; active30d: number; dormant: number; avgActivityScore: number };
  resource: {
    totalEstimatedRows: number;
    totalEstimatedStorageMb: number;
    avgResourceRiskScore: number;
    costRisk: { low: number; medium: number; high: number };
    topResourceTenants: { tenantId: number; businessName: string; estimatedRowCount: number; resourceRiskScore: number; costRiskCategory: AnalyticsRiskLabel }[];
  };
  plans: { planName: string | null; count: number }[];
  alerts: { dormant: number; trialEnding: number; pastDue: number; nearLimit: number };
  generatedAt: string;
}

export interface AnalyticsTenantRow {
  tenantId: number;
  businessName: string;
  ownerName: string;
  email: string;
  country: string | null;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  subscriptionStatus: string | null;
  planId: number | null;
  planName: string | null;
  billingCycle: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  maxProducts: number | null;
  maxStaff: number | null;
  maxLocations: number | null;
  productCount: number;
  customerCount: number;
  staffCount: number;
  locationCount: number;
  salesCount: number;
  salesTotal: number;
  salesCount30d: number;
  salesTotal30d: number;
  orderItemCount: number;
  inventoryMovementCount: number;
  lastActivityAt: string | null;
  daysSinceActivity: number | null;
  estimatedRowCount: number;
  estimatedStorageMb: number;
  activityScore: number;
  resourceRiskScore: number;
  activityLabel: AnalyticsActivityLabel;
  riskLabel: AnalyticsRiskLabel;
  costRiskCategory: AnalyticsRiskLabel;
  limitUsage: { products: number | null; staff: number | null; locations: number | null };
  recommendations: string[];
}

export interface AnalyticsTenantDetail {
  tenant: AnalyticsTenantRow;
  featureAdoption: { key: string; label: string; adopted: boolean }[];
  salesTrend: { date: string; count: number; total: number }[];
  recentEvents: { id: number; eventType: string; createdAt: string; metadata: unknown }[];
}

export interface AnalyticsEvent {
  id: number;
  tenantId: number;
  userId: number | null;
  eventType: string;
  eventReferenceId: number | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface AnalyticsTenantsQuery {
  search?: string;
  activity?: AnalyticsActivityLabel;
  risk?: AnalyticsRiskLabel;
  subscriptionStatus?: string;
  sort?: "activityScore" | "resourceRiskScore" | "salesTotal" | "salesCount30d" | "createdAt";
  dir?: "asc" | "desc";
}

export const superadminAnalyticsOverview = () =>
  api<AnalyticsOverview>("/superadmin/analytics/overview", { headers: superadminAuthHeaders(), cache: "no-store" });

export const superadminAnalyticsTenants = (params?: AnalyticsTenantsQuery) => {
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return api<{ tenants: AnalyticsTenantRow[]; count: number }>(`/superadmin/analytics/tenants${qs ? `?${qs}` : ""}`, {
    headers: superadminAuthHeaders(),
    cache: "no-store",
  });
};

export const superadminAnalyticsTenantDetail = (tenantId: number) =>
  api<AnalyticsTenantDetail>(`/superadmin/analytics/tenants/${tenantId}`, { headers: superadminAuthHeaders(), cache: "no-store" });

export const superadminAnalyticsTenantEvents = (tenantId: number, limit = 100) =>
  api<{ events: AnalyticsEvent[] }>(`/superadmin/analytics/tenants/${tenantId}/events?limit=${limit}`, {
    headers: superadminAuthHeaders(),
    cache: "no-store",
  });

export const superadminAnalyticsRunSnapshots = () =>
  api<{ success: boolean; tenants: number; snapshotDate: string }>("/superadmin/analytics/snapshots/run", {
    method: "POST",
    headers: superadminAuthHeaders(),
  });

/* ─── Alerts Center ─── */
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "resolved" | "dismissed";

export interface AnalyticsAlert {
  id: number;
  tenantId: number;
  businessName: string | null;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AnalyticsAlertsResult {
  alerts: AnalyticsAlert[];
  summary: {
    open: number;
    resolved: number;
    dismissed: number;
    bySeverity: Record<AlertSeverity, number>;
  };
}

export const superadminAnalyticsAlerts = (params?: { status?: string; severity?: string }) => {
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return api<AnalyticsAlertsResult>(`/superadmin/analytics/alerts${qs ? `?${qs}` : ""}`, {
    headers: superadminAuthHeaders(),
    cache: "no-store",
  });
};

export const superadminAnalyticsGenerateAlerts = () =>
  api<{ success: boolean; created: number; resolved: number; refreshed: number; openTotal: number }>(
    "/superadmin/analytics/alerts/generate",
    { method: "POST", headers: superadminAuthHeaders() },
  );

export const superadminAnalyticsUpdateAlert = (id: number, patch: { status?: AlertStatus; note?: string | null }) =>
  api<AnalyticsAlert>(`/superadmin/analytics/alerts/${id}`, {
    method: "PATCH",
    headers: { ...superadminAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });

/* ─── Password Reset ─── */
export const saasForgotPassword = (email: string) =>
  api<{ success: boolean }>("/saas/forgot-password", { method: "POST", body: JSON.stringify({ email }) });

export const saasResetPassword = (token: string, newPassword: string) =>
  api<{ success: boolean }>("/saas/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });

/* ─── Email Verification ─── */
export const saasSendVerification = () =>
  api<{ success: boolean }>("/saas/send-verification", { method: "POST", headers: tenantAuthHeaders() });

export const saasVerifyEmail = (token: string) =>
  api<{ success: boolean }>("/saas/verify-email", { method: "POST", body: JSON.stringify({ token }) });

/* ─── Roles ─── */
export const getRoles = () =>
  api<{ roles: RoleRow[]; permissions: PermissionDef[] }>("/roles", { headers: tenantAuthHeaders() });

export const createRole = (data: { name: string; color?: string; permissions: string[] }) =>
  api<RoleRow>("/roles", { method: "POST", body: JSON.stringify(data), headers: tenantAuthHeaders() });

export const updateRole = (id: number, data: { name?: string; color?: string; permissions?: string[] }) =>
  api<RoleRow>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(data), headers: tenantAuthHeaders() });

export const deleteRole = (id: number) =>
  api<{ success: boolean }>(`/roles/${id}`, { method: "DELETE", headers: tenantAuthHeaders() });

export const superadminGetUsers = (q?: string) =>
  api<UserRow[]>(`/superadmin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: superadminAuthHeaders() });

export const superadminImpersonate = (tenantId: number) =>
  api<{ token: string; tenant: { id: number; email: string; businessName: string }; impersonationLogId?: number }>(`/superadmin/tenants/${tenantId}/impersonate`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export const superadminEndImpersonation = (logId: number) =>
  api<{ ok: boolean }>("/superadmin/impersonation-end", {
    method: "POST", body: JSON.stringify({ logId }), headers: superadminAuthHeaders(),
  });

export const superadminGetImpersonationLogs = () =>
  api<ImpersonationLog[]>("/superadmin/impersonation-logs", { headers: superadminAuthHeaders() });

export const superadminCloseImpersonationSession = (logId: number) =>
  api<{ success: boolean }>(`/superadmin/impersonation-logs/${logId}/close`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export interface CustomerReceiptInfo {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  outstandingBalance: number;
}

export const fetchCustomerReceiptInfo = (id: number) =>
  api<CustomerReceiptInfo>(`/customers/${id}/receipt-info`, { headers: tenantAuthHeaders() });

export interface CustomerByCardResult {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  loyaltyPoints: number;
  cardNumber?: string | null;
}

/** Look up a customer by their scanned loyalty card number. Throws an ApiError
 * (404) when no customer matches the card for this tenant. */
export const fetchCustomerByCard = (cardNumber: string) =>
  api<CustomerByCardResult>(`/customers/by-card/${encodeURIComponent(cardNumber.trim())}`, {
    headers: tenantAuthHeaders(),
    cache: "no-store",
  });

export interface VoucherLookupResult {
  id: number;
  code: string;
  originalValue: number;
  balance: number;
  status: string;
  expiryDate?: string | null;
  customerName?: string | null;
}

/** Look up a gift voucher by its code for redemption at the POS. Throws an
 * ApiError (404) when no voucher matches the code for this tenant. */
export const lookupGiftVoucher = (code: string) =>
  api<VoucherLookupResult>(`/gift-vouchers/lookup/${encodeURIComponent(code.trim().toUpperCase())}`, {
    headers: tenantAuthHeaders(),
    cache: "no-store",
  });

export const fetchAuditLogs = async (params?: { action?: string; staffId?: number; entityType?: string; from?: string; to?: string; q?: string }): Promise<AuditLog[]> => {
  const headers = tenantAuthHeaders();
  const qs = params
    ? Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const res = await api<{ logs: AuditLog[]; total: number }>(`/audit-logs${qs ? `?${qs}` : ""}`, { headers, cache: "no-store" });
  return res.logs;
};

export const superadminResetPassword = (tenantId: number, newPassword: string) =>
  api<{ success: boolean }>(`/superadmin/tenants/${tenantId}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), headers: superadminAuthHeaders(),
  });

export const superadminResetAdminUserPassword = (adminUserId: number, newPassword: string) =>
  api<{ success: boolean }>(`/superadmin/admin-users/${adminUserId}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), headers: superadminAuthHeaders(),
  });

export const superadminForceLogoutTenant = (tenantId: number) =>
  api<{ success: boolean; invalidatedAt: string; affectedAdminUsers: number }>(
    `/superadmin/tenants/${tenantId}/force-logout`,
    { method: "POST", headers: superadminAuthHeaders() },
  );

export const superadminForceLogoutAdminUser = (adminUserId: number) =>
  api<{ success: boolean; invalidatedAt: string }>(
    `/superadmin/admin-users/${adminUserId}/force-logout`,
    { method: "POST", headers: superadminAuthHeaders() },
  );

/* ─── Email Templates ─── */
export const superadminGetEmailTemplates = () =>
  api<EmailTemplate[]>("/superadmin/email/templates", { headers: superadminAuthHeaders() });

export const superadminCreateEmailTemplate = (data: EmailTemplateInput) =>
  api<EmailTemplate>("/superadmin/email/templates", { method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders() });

export const superadminUpdateEmailTemplate = (id: number, data: Partial<EmailTemplateInput>) =>
  api<EmailTemplate>(`/superadmin/email/templates/${id}`, { method: "PUT", body: JSON.stringify(data), headers: superadminAuthHeaders() });

export const superadminDeleteEmailTemplate = (id: number) =>
  api<{ success: boolean }>(`/superadmin/email/templates/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

export const superadminToggleEmailTemplate = (id: number) =>
  api<EmailTemplate>(`/superadmin/email/templates/${id}/toggle`, { method: "PATCH", headers: superadminAuthHeaders() });

export const superadminTestEmailTemplate = (id: number, to: string, variables: Record<string, string>) =>
  api<{ success: boolean; messageId?: string }>(`/superadmin/email/templates/${id}/test`, {
    method: "POST", body: JSON.stringify({ to, variables }), headers: superadminAuthHeaders(),
  });

export const superadminGetEmailDefaultTemplate = (eventKey: string) =>
  api<{ name: string; subject: string; htmlBody: string; textBody: string }>(`/superadmin/email/defaults/${eventKey}`, { headers: superadminAuthHeaders() });

export const superadminGetEmailLogs = (limit = 100, offset = 0) =>
  api<EmailLog[]>(`/superadmin/email/logs?limit=${limit}&offset=${offset}`, { headers: superadminAuthHeaders() });

export const superadminSeedEmailTemplates = (replace = false) =>
  api<{ success: boolean; results: { eventKey: string; action: string }[] }>("/superadmin/email/seed-defaults", {
    method: "POST", body: JSON.stringify({ replace }), headers: superadminAuthHeaders(),
  });

export const superadminSendConnectionTest = (to: string) =>
  api<{ success: boolean; messageId?: string; outboundIp?: string }>("/superadmin/email/send-test", {
    method: "POST", body: JSON.stringify({ to }), headers: superadminAuthHeaders(),
  });

/* ─── Marketing / Promotional ─── */
export type MarketingAudience = "all" | "owners" | "admins" | "active" | "trial" | "verified";

export interface MarketingCampaign {
  id: number; subject: string; htmlBody: string; fromName: string; fromAddress: string;
  audience: string; status: string; totalRecipients: number; sentCount: number;
  failedCount: number; openCount: number; clickCount: number;
  errorMessage: string | null; createdAt: string; sentAt: string | null;
  resumedAt: string | null; resumeCount: number;
  resumeAlertedAt: string | null;
  unsubscribeCount?: number;
}

export interface MarketingRecipient {
  id: number; campaignId: number; email: string; name: string | null; status: string;
  messageId: string | null; errorMessage: string | null; sentAt: string | null;
  openedAt: string | null; clickedAt: string | null; openCount: number; clickCount: number;
}

export const superadminMarketingStatus = () =>
  api<{ provider: string; configured: boolean; webhookUrl: string; webhookSecretConfigured: boolean }>("/superadmin/marketing/status", { headers: superadminAuthHeaders() });

export const superadminMarketingAudience = (audience: MarketingAudience) =>
  api<{ total: number; sample: { email: string; name: string | null }[] }>(`/superadmin/marketing/audience?audience=${audience}`, { headers: superadminAuthHeaders() });

export const superadminMarketingCampaigns = () =>
  api<MarketingCampaign[]>("/superadmin/marketing/campaigns", { headers: superadminAuthHeaders() });

export interface MarketingLinkBreakdownEntry {
  url: string;
  clickCount: number;
}

export interface MarketingUnsubscribe {
  id: number; email: string; unsubscribedAt: string;
  campaignId: number | null;
  campaignSubject: string | null;
}

export const superadminMarketingCampaign = (id: number) =>
  api<{ campaign: MarketingCampaign; recipients: MarketingRecipient[]; unsubscribeCount: number; linkBreakdown?: MarketingLinkBreakdownEntry[] }>(`/superadmin/marketing/campaigns/${id}`, { headers: superadminAuthHeaders() });

export interface MarketingRecipientClick {
  id: number;
  url: string;
  clickedAt: string;
}

export const superadminMarketingRecipientClicks = (campaignId: number, recipientId: number) =>
  api<{ clicks: MarketingRecipientClick[] }>(
    `/superadmin/marketing/campaigns/${campaignId}/recipients/${recipientId}/clicks`,
    { headers: superadminAuthHeaders() },
  );

export interface MarketingClickTrendPoint {
  time: string;
  [url: string]: number | string;
}

export const superadminMarketingClickTrend = (id: number) =>
  api<{ bucketSize: "hour" | "day"; urls: string[]; points: MarketingClickTrendPoint[] }>(`/superadmin/marketing/campaigns/${id}/click-trend`, { headers: superadminAuthHeaders() });

export const superadminMarketingUnsubscribes = () =>
  api<{ total: number; unsubscribes: MarketingUnsubscribe[] }>("/superadmin/marketing/unsubscribes", { headers: superadminAuthHeaders() });

export const superadminMarketingProgress = (id: number) =>
  api<{ status: string; total: number; sent: number; failed: number; pending: number; opened: number; clicked: number; resumedAt: string | null; resumeCount: number }>(`/superadmin/marketing/campaigns/${id}/progress`, { headers: superadminAuthHeaders() });

export const superadminMarketingTest = (data: { to: string; subject: string; htmlBody: string; fromName: string; fromAddress: string }) =>
  api<{ success: boolean; messageId?: string }>("/superadmin/marketing/test", {
    method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders(),
  });

export const superadminMarketingSend = (data: { subject: string; htmlBody: string; fromName: string; fromAddress: string; audience: MarketingAudience }) =>
  api<{ success: boolean; campaign: MarketingCampaign; queued: number }>("/superadmin/marketing/send", {
    method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders(),
  });

export const superadminMarketingDelete = (id: number) =>
  api<{ success: boolean }>(`/superadmin/marketing/campaigns/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

export const superadminMarketingPause = (id: number) =>
  api<{ success: boolean; status: string }>(`/superadmin/marketing/campaigns/${id}/pause`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export const superadminMarketingResume = (id: number) =>
  api<{ success: boolean; status: string }>(`/superadmin/marketing/campaigns/${id}/resume`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export const superadminMarketingCancel = (id: number) =>
  api<{ success: boolean; status: string; skippedCount: number }>(`/superadmin/marketing/campaigns/${id}/cancel`, {
    method: "POST", headers: superadminAuthHeaders(),
  });

export async function superadminMarketingExport(id: number): Promise<void> {
  const resp = await fetch(`/api/superadmin/marketing/campaigns/${id}/export`, {
    headers: superadminAuthHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText })) as Record<string, unknown>;
    throw new Error(typeof body["error"] === "string" ? body["error"] : resp.statusText);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campaign-${id}-engagement.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function superadminMarketingUnsubscribesExport(): Promise<void> {
  const resp = await fetch(`/api/superadmin/marketing/unsubscribes/export`, {
    headers: superadminAuthHeaders(),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText })) as Record<string, unknown>;
    throw new Error(typeof body["error"] === "string" ? body["error"] : resp.statusText);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `marketing-unsubscribes.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ─── Types ─── */
export interface Tenant {
  id: number; businessName: string; ownerName: string; email: string; phone?: string;
  address?: string; country?: string; status: string; onboardingStep: number; onboardingComplete: boolean;
  emailVerified: boolean;
}

export interface Subscription {
  id: number; tenantId: number; planId: number | null; status: string;
  provider?: string; billingCycle?: string; trialEndsAt?: string; currentPeriodEnd?: string;
}

export interface Plan {
  id: number; name: string; slug: string; description: string;
  priceMonthly: number; priceAnnual: number;
  maxStaff: number; maxProducts: number; maxLocations: number; maxInvoices: number;
  modules: string[]; features: string[]; isActive: boolean;
  isPromotional?: boolean; durationDays?: number | null;
}

export interface TenantRow extends Tenant {
  subscriptionStatus?: string; planId?: number; billingCycle?: string;
  currentPeriodStart?: string; currentPeriodEnd?: string; trialEndsAt?: string; planName?: string;
  createdAt: string; lastLoginAt?: string | null;
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
  id: number;           // tenant ID (used for Login As impersonation)
  adminUserId?: number | null; // set for co-admin users only
  userType?: "owner" | "admin";
  businessName: string; ownerName: string; email: string;
  phone?: string; country?: string; status: string;
  onboardingComplete: boolean; onboardingStep: number; createdAt: string;
  subscriptionStatus?: string; planName?: string; billingCycle?: string;
}

export interface RoleRow {
  id: number; tenantId: number; name: string; color: string;
  permissions: string[]; isSystem: boolean; createdAt: string; updatedAt: string;
}

export interface PermissionDef {
  key: string; label: string; category: string;
}

export type EventKey = "user_signup" | "payment_success" | "payment_failed" | "trial_expiring" | "password_reset";

export interface EmailTemplate {
  id: number;
  name: string;
  eventKey: EventKey;
  subject: string;
  htmlBody: string;
  textBody: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailTemplateInput {
  name: string;
  eventKey: EventKey;
  subject: string;
  htmlBody: string;
  textBody: string;
  isEnabled?: boolean;
}

export interface EmailLog {
  id: number;
  templateId: number | null;
  eventKey: string;
  toEmail: string;
  subject: string;
  status: string;
  messageId: string | null;
  errorMessage: string | null;
  variables: string | null;
  sentAt: string;
}

export interface AuditLog {
  id: number;
  tenantId: number;
  staffId: number | null;
  staffName?: string;
  action: string;
  entityType: string | null;
  entityId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

/* ─── Weighing Scale ─── */
export interface ScaleProduct {
  id: number;
  name: string;
  category: string;
  price: number;
  barcode: string | null;
  soldByWeight: boolean;
  unitOfMeasure: string | null;
  plu: string | null;
}

export interface WeightLabel {
  id: number;
  tenantId: number;
  productId: number;
  productName: string;
  productPlu: string;
  unitOfMeasure: string;
  weightValue: number;
  pricePerUnit: number;
  totalPrice: number;
  packDate: string | null;
  expirationDate: string | null;
  barcode: string;
  status: "available" | "sold" | "voided";
  createdByStaffId: number | null;
  createdByStaffName: string | null;
  soldOrderId: number | null;
  createdAt: string;
  soldAt: string | null;
}

/**
 * Adds the `x-staff-id` header used by server-side staff-permission checks
 * (e.g. `requireScaleStaff` in routes/scale.ts). Pass the active operator's
 * staff id on any call that mutates scale data.
 */
function staffAuthHeaders(staffId?: number | null): Record<string, string> {
  return { ...tenantAuthHeaders(), ...(staffId ? { "x-staff-id": String(staffId) } : {}) };
}

export const getScaleProducts = (weightOnly = false) =>
  api<ScaleProduct[]>(`/scale/products${weightOnly ? "?weightOnly=1" : ""}`, { headers: tenantAuthHeaders() });

export const updateScaleProductSettings = (
  id: number,
  data: { soldByWeight: boolean; unitOfMeasure?: "lb" | "kg" | "oz" | "g" },
  staffId?: number,
) =>
  api<ScaleProduct>(`/scale/products/${id}`, {
    method: "PATCH", body: JSON.stringify(data), headers: staffAuthHeaders(staffId),
  });

export const createWeightLabel = (data: { productId: number; weightValue: number; packDate?: string | null; expirationDate?: string | null; staffId?: number }) =>
  api<WeightLabel>("/scale/labels", {
    method: "POST", body: JSON.stringify(data), headers: staffAuthHeaders(data.staffId),
  });

export const listWeightLabels = (status: "available" | "sold" | "voided" | "reserved" = "available") =>
  api<WeightLabel[]>(`/scale/labels?status=${status}`, { headers: tenantAuthHeaders() });

export const lookupWeightLabel = (barcode: string) =>
  api<{ source: "label" | "derived"; label: WeightLabel & { id: number | null } }>(
    `/scale/labels/lookup/${encodeURIComponent(barcode)}`,
    { headers: tenantAuthHeaders() },
  );

export const markWeightLabelsSold = (labelIds: number[], orderId?: number) =>
  api<{ updated: number }>("/scale/labels/mark-sold", {
    method: "POST", body: JSON.stringify({ labelIds, orderId }), headers: tenantAuthHeaders(),
  });

/** Releases reserved labels back to 'available' (cart removal / order failure). */
export const releaseWeightLabels = (labelIds: number[]) =>
  api<{ released: number }>("/scale/labels/release", {
    method: "POST", body: JSON.stringify({ labelIds }), headers: tenantAuthHeaders(),
  });

export const voidWeightLabel = (id: number, staffId?: number) =>
  api<{ success: boolean }>(`/scale/labels/${id}`, {
    method: "DELETE", headers: staffAuthHeaders(staffId),
  });

export interface ImpersonationLog {
  id: number;
  superadminEmail: string;
  tenantId: number;
  tenantEmail: string;
  businessName: string;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

/* ─── Volume pricing tiers + multi-unit (retail engine) ─── */
export interface PricingTier {
  id: number;
  productId: number;
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
}
export interface PurchaseUnit {
  id: number;
  productId: number;
  unitName: string;
  conversionFactor: number;
  isPurchase: boolean;
  isSale: boolean;
}

export const getPricingTiers = (productId: number) =>
  api<PricingTier[]>(`/products/${productId}/pricing-tiers`, { headers: tenantAuthHeaders() });

export const replacePricingTiers = (
  productId: number,
  tiers: { minQty: number; maxQty: number | null; unitPrice: number }[],
) =>
  api<PricingTier[]>(`/products/${productId}/pricing-tiers`, {
    method: "PUT", body: JSON.stringify({ tiers }), headers: tenantAuthHeaders(),
  });

export const getPurchaseUnits = (productId: number) =>
  api<PurchaseUnit[]>(`/products/${productId}/purchase-units`, { headers: tenantAuthHeaders() });

export const replacePurchaseUnits = (
  productId: number,
  units: { unitName: string; conversionFactor: number; isPurchase?: boolean; isSale?: boolean }[],
) =>
  api<PurchaseUnit[]>(`/products/${productId}/purchase-units`, {
    method: "PUT", body: JSON.stringify({ units }), headers: tenantAuthHeaders(),
  });

/* ─── Payment Methods ─── */
export interface PaymentMethod {
  id: number;
  tenantId: number;
  name: string;
  type: "cash" | "card" | "split" | "credit" | "digital" | "custom";
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const listPaymentMethods = () =>
  api<PaymentMethod[]>("/payment-methods", { headers: tenantAuthHeaders() });

export const createPaymentMethod = (data: {
  name: string;
  type?: PaymentMethod["type"];
  isEnabled?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
}) =>
  api<PaymentMethod>("/payment-methods", {
    method: "POST", body: JSON.stringify(data), headers: tenantAuthHeaders(),
  });

export const updatePaymentMethod = (
  id: number,
  data: { name?: string; isEnabled?: boolean; isDefault?: boolean; sortOrder?: number },
) =>
  api<PaymentMethod>(`/payment-methods/${id}`, {
    method: "PUT", body: JSON.stringify(data), headers: tenantAuthHeaders(),
  });

export const deletePaymentMethod = (id: number) =>
  fetch(`/api/payment-methods/${id}`, {
    method: "DELETE", headers: tenantAuthHeaders(),
  }).then((r) => {
    if (!r.ok && r.status !== 204) throw new Error("Failed to delete payment method");
  });

/** Mirror of server-side applyVolumePricing for live POS preview. */
export function previewTierPrice(basePrice: number, qty: number, tiers: PricingTier[]) {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen: PricingTier | null = null;
  for (const t of sorted) {
    const max = t.maxQty ?? Number.POSITIVE_INFINITY;
    if (qty >= t.minQty && qty <= max) chosen = t;
  }
  const unitPrice = chosen ? chosen.unitPrice : basePrice;
  return { unitPrice, tier: chosen, savingsPerUnit: Math.max(0, basePrice - unitPrice) };
}

/* ─── Technicians (Installers) ─── */
export const TECHNICIAN_TOKEN_KEY = "nexus_technician_token";

function technicianAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TECHNICIAN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface Technician {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  status: "pending" | "approved" | "suspended" | "rejected";
  createdAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  lastLoginAt?: string | null;
}

export interface TechnicianAssignedTenant {
  id: number;
  businessName: string;
  email: string;
  ownerName?: string | null;
  status: string;
  country?: string | null;
  assignedAt: string;
}

export const technicianRegister = (data: { name: string; email: string; password: string; phone?: string; acceptedTerms: boolean }) =>
  api<{ id: number; status: string }>("/technician/register", {
    method: "POST", body: JSON.stringify(data),
  });

export const technicianLogin = (email: string, password: string) =>
  api<{ token: string; technician: Technician }>("/technician/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  });

export const technicianMe = () =>
  api<{ technician: Technician }>("/technician/me", { headers: technicianAuthHeaders() });

export const technicianListTenants = () =>
  api<TechnicianAssignedTenant[]>("/technician/tenants", { headers: technicianAuthHeaders() });

export const technicianLoginAs = (tenantId: number) =>
  api<{ token: string; tenant: { id: number; email: string; businessName: string }; impersonationLogId: number; restrictedRole: string }>(
    `/technician/tenants/${tenantId}/login-as`,
    { method: "POST", headers: technicianAuthHeaders() },
  );

export const technicianImpersonationEnd = (logId: number) =>
  api<{ success: boolean }>("/technician/impersonation-end", {
    method: "POST", body: JSON.stringify({ logId }), headers: technicianAuthHeaders(),
  });

/* ─── Superadmin: Technicians management ─── */
export interface TechnicianRow extends Technician {
  assignmentCount: number;
}
export interface TechnicianAssignment {
  id: number;
  tenantId: number;
  assignedAt: string;
  assignedBy?: string | null;
  businessName?: string | null;
  email?: string | null;
  status?: string | null;
}
export interface TechnicianDetail extends Technician {
  assignments: TechnicianAssignment[];
}
export interface TenantLite { id: number; businessName: string; email: string; status: string }

export const superadminListTechnicians = (status?: string) =>
  api<TechnicianRow[]>(`/superadmin/technicians${status ? `?status=${encodeURIComponent(status)}` : ""}`, { headers: superadminAuthHeaders() });

export const superadminGetTechnician = (id: number) =>
  api<TechnicianDetail>(`/superadmin/technicians/${id}`, { headers: superadminAuthHeaders() });

export const superadminPatchTechnician = (id: number, body: Partial<Pick<Technician, "name" | "phone" | "status">>) =>
  api<Technician>(`/superadmin/technicians/${id}`, {
    method: "PATCH", body: JSON.stringify(body), headers: superadminAuthHeaders(),
  });

export const superadminDeleteTechnician = (id: number) =>
  api<{ success: boolean }>(`/superadmin/technicians/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

export const superadminResetTechnicianPassword = (id: number, newPassword: string) =>
  api<{ success: boolean }>(`/superadmin/technicians/${id}/reset-password`, {
    method: "POST", body: JSON.stringify({ newPassword }), headers: superadminAuthHeaders(),
  });

export const superadminAssignTechnician = (technicianId: number, tenantId: number) =>
  api<TechnicianAssignment>(`/superadmin/technicians/${technicianId}/assignments`, {
    method: "POST", body: JSON.stringify({ tenantId }), headers: superadminAuthHeaders(),
  });

export const superadminUnassignTechnician = (technicianId: number, tenantId: number) =>
  api<{ success: boolean }>(`/superadmin/technicians/${technicianId}/assignments/${tenantId}`, {
    method: "DELETE", headers: superadminAuthHeaders(),
  });

export const superadminSearchTenantsLite = (q?: string) =>
  api<TenantLite[]>(`/superadmin/tenants-lite${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: superadminAuthHeaders() });

/* ─── Manual / Offline Subscription Payments ─── */

export interface ManualPayment {
  id: number;
  tenantId: number;
  planId: number;
  planName: string | null;
  billingCycle: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  scheduledStartDate: string;
  scheduledEndDate: string;
  status: "scheduled" | "applied" | "cancelled";
  appliedAt: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CreateManualPaymentInput {
  planId: number;
  billingCycle: "monthly" | "annual";
  amount: number;
  paymentMethod: "cash" | "bank_transfer" | "cheque" | "card" | "other";
  referenceNumber?: string;
  notes?: string;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
}

export const superadminGetManualPayments = (tenantId: number) =>
  api<ManualPayment[]>(`/superadmin/tenants/${tenantId}/manual-payments`, { headers: superadminAuthHeaders() });

export const superadminCreateManualPayment = (tenantId: number, data: CreateManualPaymentInput) =>
  api<ManualPayment>(`/superadmin/tenants/${tenantId}/manual-payments`, {
    method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders(),
  });

export const superadminCancelManualPayment = (tenantId: number, paymentId: number) =>
  api<{ success: boolean }>(`/superadmin/tenants/${tenantId}/manual-payments/${paymentId}`, {
    method: "DELETE", headers: superadminAuthHeaders(),
  });

/* ─── Bulk Price Manager ─── */

export type PriceMethod = "percent" | "cost_markup" | "fixed";
export type PriceRounding = "none" | "5" | "10" | "50" | "100" | "1000";
export type PriceScope = "all" | "category" | "products";

export interface PricePreviewRequest {
  method: PriceMethod;
  value: number;
  direction: "up" | "down";
  rounding: PriceRounding;
  scope: PriceScope;
  categories?: string[];
  productIds?: number[];
}

export interface PricePreviewRow {
  productId: number;
  productName: string;
  category: string;
  oldPrice: number;
  costPrice: number | null;
  newPrice: number | null;
  skipped: string | null;
}

export interface PriceChangeLogRow {
  id: number;
  staffId: number | null;
  staffName: string | null;
  method: string;
  value: number;
  rounding: string;
  scope: string;
  affectedCount: number;
  details: Array<{ productId: number; productName: string; oldPrice: number; newPrice: number }>;
  createdAt: string;
}

export const pricePreview = (body: PricePreviewRequest & { staffId: number; staffName?: string }) =>
  api<{ rows: PricePreviewRow[]; total: number }>(`/price-manager/preview`, {
    method: "POST", body: JSON.stringify(body), headers: tenantAuthHeaders(),
  });

export const priceApply = (body: PricePreviewRequest & {
  staffId: number;
  staffName?: string;
  changes: { productId: number; newPrice: number }[];
}) =>
  api<{ appliedCount: number; changes: { productId: number; productName: string; oldPrice: number; newPrice: number }[] }>(
    `/price-manager/apply`,
    { method: "POST", body: JSON.stringify(body), headers: tenantAuthHeaders() },
  );

export const priceListLogs = (staffId: number, limit = 50) =>
  api<{ logs: PriceChangeLogRow[] }>(`/price-manager/logs?staffId=${staffId}&limit=${limit}`, { headers: tenantAuthHeaders() });

/* ─── Time-Based Promotions ─── */

export interface Promotion {
  id: number;
  productId: number;
  productName: string | null;
  regularPrice: number | null;
  promoPrice: number;
  startAt: string;
  endAt: string;
  active: boolean;
  createdAt: string;
}

export interface ActivePromoMap {
  [productId: number]: { promoPrice: number; endAt: string };
}

export const listPromotions = () =>
  api<{ promotions: Promotion[] }>(`/promotions`, { headers: tenantAuthHeaders() });

export const listActivePromotions = () =>
  api<{ activePromos: ActivePromoMap }>(`/promotions/active`, { headers: tenantAuthHeaders() });

export const createPromotion = (body: {
  productId: number; promoPrice: number; startAt: string; endAt: string; active?: boolean; staffId: number;
}) =>
  api<Promotion>(`/promotions`, { method: "POST", body: JSON.stringify(body), headers: tenantAuthHeaders() });

export const updatePromotion = (id: number, body: Partial<{
  promoPrice: number; startAt: string; endAt: string; active: boolean;
}> & { staffId: number }) =>
  api<Promotion>(`/promotions/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: tenantAuthHeaders() });

export const deletePromotion = (id: number, staffId: number) =>
  api<{ success: boolean }>(`/promotions/${id}?staffId=${staffId}`, { method: "DELETE", headers: tenantAuthHeaders() });

// ── Product Batches (FIFO/LIFO lot + expiry tracking) ─────────────────────
export interface ProductBatch {
  id: number;
  productId: number;
  productName: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantityRemaining: number;
  receivedAt: string;
  sourceType: string | null;
  purchaseBillId: number | null;
}

export const listProductBatches = (params: { productId?: number; includeEmpty?: boolean } = {}) => {
  const qs = new URLSearchParams();
  if (params.productId != null) qs.set("productId", String(params.productId));
  if (params.includeEmpty) qs.set("includeEmpty", "true");
  const q = qs.toString();
  return api<{ batches: ProductBatch[] }>(`/product-batches${q ? `?${q}` : ""}`, { headers: tenantAuthHeaders() });
};

// ── Supplier Returns / Debit Notes ────────────────────────────────────────
export interface SupplierReturn {
  id: number;
  returnNumber: string;
  supplier?: string;
  purchaseBillId?: number;
  status: "draft" | "confirmed" | "cancelled";
  notes?: string;
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  returnDate: string;
  itemCount: number;
  createdAt: string;
}

export interface SupplierReturnItem {
  id: number;
  returnId: number;
  productId: number;
  productName: string;
  purchaseBillItemId: number | null;
  quantity: number;
  unitCost: number;
  taxRate: number | null;
  taxAmount: number;
  totalAmount: number;
  batchId: number | null;
  batchLabel: string | null;
  notes: string | null;
}

export interface SupplierReturnWithItems extends SupplierReturn {
  items: SupplierReturnItem[];
}

export interface EligibleReturnLine {
  purchaseBillItemId: number;
  productId: number;
  productName: string;
  trackBatches: boolean;
  originalQuantity: number;
  alreadyReturned: number;
  returnableQuantity: number;
  unitCost: number;
  taxRate: number | null;
}

export interface EligibleBillReturn {
  billId: number;
  billNumber: string;
  supplier: string | null;
  defaultTaxRate: number;
  lines: EligibleReturnLine[];
}

export interface CreateSupplierReturnItem {
  productId: number;
  purchaseBillItemId?: number | null;
  quantity: number;
  unitCost?: number;
  taxRate?: number | null;
  batchId?: number | null;
  notes?: string | null;
}

export interface CreateSupplierReturnBody {
  returnNumber: string;
  supplier?: string | null;
  purchaseBillId?: number | null;
  notes?: string | null;
  status?: "draft" | "confirmed";
  defaultTaxRate?: number;
  items: CreateSupplierReturnItem[];
}

export const listSupplierReturns = () =>
  api<SupplierReturn[]>(`/supplier-returns`, { headers: tenantAuthHeaders() });

export const getSupplierReturn = (id: number) =>
  api<SupplierReturnWithItems>(`/supplier-returns/${id}`, { headers: tenantAuthHeaders() });

export const getEligibleBillForReturn = (billId: number) =>
  api<EligibleBillReturn>(`/supplier-returns/eligible/${billId}`, { headers: tenantAuthHeaders() });

export const createSupplierReturn = (body: CreateSupplierReturnBody) =>
  api<SupplierReturn>(`/supplier-returns`, { method: "POST", body: JSON.stringify(body), headers: tenantAuthHeaders() });

export const confirmSupplierReturn = (id: number) =>
  api<SupplierReturnWithItems>(`/supplier-returns/${id}/confirm`, { method: "POST", headers: tenantAuthHeaders() });

export const deleteSupplierReturn = (id: number) =>
  api<void>(`/supplier-returns/${id}`, { method: "DELETE", headers: tenantAuthHeaders() });

/* ─── Table Close ─── */
export interface CloseTableResult {
  closedOrderIds: number[];
  total: number;
}

export const activateFreeSubscription = (planSlug: string, billingCycle: "monthly" | "annual") =>
  api<{ success: boolean; plan: { name: string; slug: string } }>("/billing/free-activate", {
    method: "POST",
    body: JSON.stringify({ planSlug, billingCycle }),
    headers: tenantAuthHeaders(),
  });

export const redeemCoupon = (code: string) =>
  api<{ success: boolean; plan: { name: string; slug: string } }>("/billing/redeem-coupon", {
    method: "POST",
    body: JSON.stringify({ code }),
    headers: tenantAuthHeaders(),
  });

export const closeTable = (
  tableId: number,
  body: { paymentMethod: string; cardType?: string; splitCardAmount?: number; splitCashAmount?: number },
) =>
  api<CloseTableResult>(`/tables/${tableId}/close`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: tenantAuthHeaders(),
  });

export interface RecommendedPlan {
  name: string;
  slug: string;
  maxProducts: number | null;
  priceMonthly: number;
  priceAnnual: number;
}

export interface PlanLimitStatus {
  enforced: boolean;
  productCount: number;
  maxProducts: number | null;
  planName: string | null;
  planSlug: string | null;
  atLimit: boolean;
  overBy: number;
  recommendedPlan: RecommendedPlan | null;
}

export const getPlanLimitStatus = () =>
  api<PlanLimitStatus>("/products/plan-limit", { headers: tenantAuthHeaders() });

/* ─── Support Tickets ─── */
export interface SupportTicketRow {
  id: number;
  ticketRef: string;
  tenantId: number;
  businessName: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  category: string;
  subCategory: string;
  impact: string | null;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  startedWhen: string | null;
  stepsTaken: string[];
  additionalNotes: string | null;
  resolutionType: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const superadminGetSupportTickets = (params?: { status?: string; priority?: string; q?: string }) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.priority) qs.set("priority", params.priority);
  if (params?.q) qs.set("q", params.q);
  const query = qs.toString();
  return api<SupportTicketRow[]>(`/superadmin/support/tickets${query ? `?${query}` : ""}`, {
    headers: superadminAuthHeaders(),
  });
};

export const superadminUpdateSupportTicket = (id: number, data: { status?: string; adminNotes?: string }) =>
  api<SupportTicketRow>(`/superadmin/support/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: superadminAuthHeaders(),
  });

export const superadminGetSupportSettings = () =>
  api<{ supportInboxEmail: string }>("/superadmin/support/settings", {
    headers: superadminAuthHeaders(),
  });

export const superadminUpdateSupportSettings = (data: { supportInboxEmail: string }) =>
  api<{ supportInboxEmail: string }>("/superadmin/support/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: superadminAuthHeaders(),
  });

export interface CreateSupportTicketInput {
  businessName: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  category: string;
  subCategory: string;
  impact?: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  startedWhen?: string;
  stepsTaken: string[];
  additionalNotes?: string;
}

export interface CreateSupportTicketResult {
  id: number;
  ticketRef: string;
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  responseTarget: string;
}

export const submitSupportTicket = (data: CreateSupportTicketInput) =>
  api<CreateSupportTicketResult>("/support/tickets", {
    method: "POST",
    body: JSON.stringify(data),
    headers: tenantAuthHeaders(),
  });

export const logSupportSelfResolved = (data: { businessName: string; category: string; subCategory: string }) =>
  api<{ success: boolean }>("/support/self-resolved", {
    method: "POST",
    body: JSON.stringify(data),
    headers: tenantAuthHeaders(),
  });
