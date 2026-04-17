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

class ApiError extends Error {
  public readonly body: Record<string, unknown>;
  constructor(msg: string, body: Record<string, unknown>) {
    super(msg);
    this.name = "ApiError";
    this.body = body;
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
    throw new ApiError(msg || resp.statusText, body);
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
}

export interface MarketingRecipient {
  id: number; campaignId: number; email: string; name: string | null; status: string;
  messageId: string | null; errorMessage: string | null; sentAt: string | null;
  openedAt: string | null; clickedAt: string | null; openCount: number; clickCount: number;
}

export const superadminMarketingStatus = () =>
  api<{ provider: string; configured: boolean }>("/superadmin/marketing/status", { headers: superadminAuthHeaders() });

export const superadminMarketingAudience = (audience: MarketingAudience) =>
  api<{ total: number; sample: { email: string; name: string | null }[] }>(`/superadmin/marketing/audience?audience=${audience}`, { headers: superadminAuthHeaders() });

export const superadminMarketingCampaigns = () =>
  api<MarketingCampaign[]>("/superadmin/marketing/campaigns", { headers: superadminAuthHeaders() });

export const superadminMarketingCampaign = (id: number) =>
  api<{ campaign: MarketingCampaign; recipients: MarketingRecipient[] }>(`/superadmin/marketing/campaigns/${id}`, { headers: superadminAuthHeaders() });

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
