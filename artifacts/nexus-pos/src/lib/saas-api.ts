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
export const saasRegister = (data: { businessName: string; ownerName: string; email: string; password: string; phone?: string; country?: string }) =>
  api<{ token: string; tenant: Tenant }>("/saas/register", { method: "POST", body: JSON.stringify(data) });

export const saasLogin = (email: string, password: string) =>
  api<{ token: string; tenant: Tenant; subscription: Subscription }>("/saas/login", { method: "POST", body: JSON.stringify({ email, password }) });

export const saasMe = () =>
  api<{ tenant: Tenant; subscription: Subscription; plan: Plan | null }>("/saas/me", { headers: tenantAuthHeaders() });

export const saasUpdateOnboarding = (step: number, fields: Record<string, unknown>) =>
  api<{ tenant: Tenant }>("/saas/onboarding", { method: "PATCH", body: JSON.stringify({ step, ...fields }), headers: tenantAuthHeaders() });

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
};
export const superadminGetPlans = () =>
  api<Plan[]>("/superadmin/plans", { headers: superadminAuthHeaders() });
export const superadminCreatePlan = (data: PlanInput) =>
  api<Plan>("/superadmin/plans", { method: "POST", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminUpdatePlan = (id: number, data: Partial<PlanInput>) =>
  api<Plan>(`/superadmin/plans/${id}`, { method: "PUT", body: JSON.stringify(data), headers: superadminAuthHeaders() });
export const superadminDeletePlan = (id: number) =>
  api<{ success: boolean }>(`/superadmin/plans/${id}`, { method: "DELETE", headers: superadminAuthHeaders() });

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
  country?: string; status: string; onboardingStep: number; onboardingComplete: boolean;
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
  currentPeriodEnd?: string; trialEndsAt?: string; planName?: string;
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

export const technicianRegister = (data: { name: string; email: string; password: string; phone?: string }) =>
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
