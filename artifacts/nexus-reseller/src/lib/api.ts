const BASE = import.meta.env.BASE_URL.replace(/\/$/, "").replace(/\/reseller$/, "");
const API = `${BASE}/api`;

const TOKEN_KEY = "reseller_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type ResellerProfile = {
  id: number;
  name: string;
  email: string;
  companyName: string | null;
  phone: string | null;
  referralCode: string;
  commissionRate: number;
  paymentDetails: string | null;
  status: string;
  createdAt: string;
};

export type SignupInput = { name: string; email: string; password: string; companyName?: string; phone?: string };
export type LoginInput = { email: string; password: string };

export async function signup(data: SignupInput) {
  return apiFetch<{ token: string; reseller: ResellerProfile }>("/reseller/signup", { method: "POST", body: JSON.stringify(data) });
}
export async function login(data: LoginInput) {
  return apiFetch<{ token: string; reseller: ResellerProfile }>("/reseller/login", { method: "POST", body: JSON.stringify(data) });
}
export async function getMe() {
  return apiFetch<ResellerProfile>("/reseller/me");
}
export async function updateMe(data: Partial<ResellerProfile>) {
  return apiFetch<ResellerProfile>("/reseller/me", { method: "PATCH", body: JSON.stringify(data) });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type DashboardStats = {
  totalReferrals: number;
  activeSubscriptions: number;
  lifetimeEarnings: number;
  monthlyEarnings: number;
  pendingPayouts: number;
  monthlyBreakdown: Array<{ month: string; total: string | null; count: number }>;
};

export async function getDashboard() {
  return apiFetch<DashboardStats>("/reseller/dashboard");
}

// ─── Referrals ───────────────────────────────────────────────────────────────

export type Referral = {
  id: number;
  businessName: string;
  email: string;
  country: string | null;
  status: string;
  createdAt: string;
  subscriptionStatus: string | null;
  planName: string | null;
  planPrice: number | null;
  currentPeriodEnd: string | null;
};

export async function getReferrals() {
  return apiFetch<Referral[]>("/reseller/referrals");
}

// ─── Commissions ─────────────────────────────────────────────────────────────

export type Commission = {
  id: number;
  tenantId: number;
  periodMonth: string;
  baseAmount: number;
  commissionRate: number;
  commissionAmount: number;
  status: string;
  payoutId: number | null;
  createdAt: string;
  businessName: string | null;
  planName: string | null;
};

export async function getCommissions() {
  return apiFetch<Commission[]>("/reseller/commissions");
}

// ─── Payouts ─────────────────────────────────────────────────────────────────

export type Payout = {
  id: number;
  amount: number;
  commissionCount: number;
  status: string;
  notes: string | null;
  paymentDetails: string | null;
  requestedAt: string;
  paidAt: string | null;
  createdAt: string;
};

export async function getPayouts() {
  return apiFetch<Payout[]>("/reseller/payouts");
}
export async function requestPayout(notes?: string) {
  return apiFetch<Payout>("/reseller/payouts", { method: "POST", body: JSON.stringify({ notes }) });
}
