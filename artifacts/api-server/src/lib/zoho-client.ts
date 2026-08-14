/**
 * Zoho Books API client (server-only).
 *
 * Covers the OAuth token dance against Zoho Accounts and the Books v3 Contacts
 * endpoints we need for customer sync. Nothing here touches the database — the
 * caller owns credential storage/refresh policy.
 *
 * DATA CENTRES: Zoho is regional. A tenant in the EU authorizes at
 * accounts.zoho.eu and calls www.zohoapis.eu; the same token is NOT valid in
 * another data centre. The region suffix therefore travels with every call.
 */

export type ZohoRegion = "com" | "eu" | "in" | "com.au" | "jp" | "ca" | "sa" | "uk";

export const ZOHO_REGIONS: ZohoRegion[] = ["com", "eu", "in", "com.au", "jp", "ca", "sa", "uk"];

/** Human labels for the region picker in the UI. */
export const ZOHO_REGION_LABELS: Record<ZohoRegion, string> = {
  com: "United States (zoho.com)",
  eu: "Europe (zoho.eu)",
  in: "India (zoho.in)",
  "com.au": "Australia (zoho.com.au)",
  jp: "Japan (zoho.jp)",
  ca: "Canada (zohocloud.ca)",
  sa: "Saudi Arabia (zoho.sa)",
  uk: "United Kingdom (zoho.uk)",
};

export function isZohoRegion(value: unknown): value is ZohoRegion {
  return typeof value === "string" && (ZOHO_REGIONS as string[]).includes(value);
}

/** OAuth host for a data centre (Canada is the odd one out: zohocloud.ca). */
export function accountsHost(region: ZohoRegion): string {
  return region === "ca" ? "https://accounts.zohocloud.ca" : `https://accounts.zoho.${region}`;
}

/** Books API host for a data centre. */
export function apiHost(region: ZohoRegion): string {
  return region === "com.au" ? "https://www.zohoapis.com.au" : `https://www.zohoapis.${region}`;
}

/**
 * Map the `location` / `accounts-server` values Zoho appends to the OAuth
 * callback back onto our region suffix. The merchant may sign in to a different
 * data centre than the one they picked, and Zoho tells us which one they used —
 * always trust the callback over the request.
 */
export function regionFromCallback(
  location: string | undefined,
  accountsServer: string | undefined,
): ZohoRegion | null {
  const loc = (location ?? "").trim().toLowerCase();
  const byLocation: Record<string, ZohoRegion> = {
    us: "com",
    com: "com",
    eu: "eu",
    in: "in",
    au: "com.au",
    "com.au": "com.au",
    jp: "jp",
    ca: "ca",
    sa: "sa",
    uk: "uk",
  };
  if (loc && byLocation[loc]) return byLocation[loc]!;

  const server = (accountsServer ?? "").trim().toLowerCase();
  if (server.includes("zohocloud.ca")) return "ca";
  const match = server.match(/accounts\.zoho\.([a-z.]+)/);
  if (match && isZohoRegion(match[1]!)) return match[1] as ZohoRegion;
  return null;
}

/** Scopes requested when a tenant authorizes the app. */
export const ZOHO_OAUTH_SCOPES = [
  "ZohoBooks.contacts.CREATE",
  "ZohoBooks.contacts.READ",
  "ZohoBooks.contacts.UPDATE",
  "ZohoBooks.settings.READ",
].join(",");

export class ZohoApiError extends Error {
  status: number;
  code?: number;

  constructor(message: string, status = 500, code?: number) {
    super(message);
    this.name = "ZohoApiError";
    this.status = status;
    if (code !== undefined) this.code = code;
  }
}

/* ────────────────────────────── OAuth ────────────────────────────── */

export function buildZohoAuthorizeUrl(opts: {
  region: ZohoRegion;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    scope: ZOHO_OAUTH_SCOPES,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    // offline => Zoho returns a refresh token; prompt=consent forces it to be
    // re-issued even if the user previously authorized the app.
    access_type: "offline",
    prompt: "consent",
  });
  return `${accountsHost(opts.region)}/oauth/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  api_domain?: string;
  scope?: string;
  error?: string;
};

async function postToken(region: ZohoRegion, params: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(`${accountsHost(region)}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    throw new ZohoApiError("Could not reach Zoho. Check the server's internet access.", 502);
  }

  let json: TokenResponse;
  try {
    json = (await res.json()) as TokenResponse;
  } catch {
    throw new ZohoApiError(`Zoho returned an unreadable token response (HTTP ${res.status}).`, 502);
  }

  if (!res.ok || json.error) {
    throw new ZohoApiError(describeTokenError(json.error), res.ok ? 400 : res.status);
  }
  return json;
}

function describeTokenError(error: string | undefined): string {
  switch (error) {
    case "invalid_code":
      return "The Zoho authorization expired before it could be used. Please try connecting again.";
    case "invalid_client":
      return "The Zoho Client ID or Secret configured on the server is not valid.";
    case "invalid_client_secret":
      return "The Zoho Client Secret configured on the server is not valid.";
    case "redirect_uri_mismatch":
      return "This server's callback URL is not listed in the Zoho app's Authorized Redirect URIs.";
    case "invalid_grant":
      return "Zoho rejected the authorization. Reconnect the Zoho Books account.";
    default:
      return error ? `Zoho rejected the request (${error}).` : "Zoho rejected the request.";
  }
}

export async function exchangeZohoCode(opts: {
  region: ZohoRegion;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresInSec: number; scope: string }> {
  const json = await postToken(
    opts.region,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    }),
  );

  if (!json.access_token) {
    throw new ZohoApiError("Zoho did not return an access token.", 502);
  }
  if (!json.refresh_token) {
    // Happens when the user has already authorized and Zoho suppresses the
    // refresh token. prompt=consent should prevent it; surface it clearly.
    throw new ZohoApiError(
      "Zoho did not return a refresh token. Remove NEXXUS from your Zoho connected apps and try again.",
      502,
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresInSec: json.expires_in ?? 3600,
    scope: json.scope ?? ZOHO_OAUTH_SCOPES,
  };
}

export async function refreshZohoAccessToken(opts: {
  region: ZohoRegion;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<{ accessToken: string; expiresInSec: number }> {
  const json = await postToken(
    opts.region,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      refresh_token: opts.refreshToken,
    }),
  );

  if (!json.access_token) {
    throw new ZohoApiError(
      "Zoho would not renew the access token. Reconnect the Zoho Books account.",
      401,
    );
  }
  return { accessToken: json.access_token, expiresInSec: json.expires_in ?? 3600 };
}

/** Revoke a refresh token so disconnecting in NEXXUS also unlinks in Zoho. */
export async function revokeZohoRefreshToken(
  region: ZohoRegion,
  refreshToken: string,
): Promise<void> {
  const params = new URLSearchParams({ token: refreshToken });
  await fetch(`${accountsHost(region)}/oauth/v2/token/revoke?${params.toString()}`, {
    method: "POST",
  }).catch(() => undefined);
}

/* ───────────────────────── Books v3 contacts ───────────────────────── */

/** The Zoho Books contact fields we read/write. Zoho returns much more. */
export type ZohoContact = {
  contact_id: string;
  contact_name?: string;
  company_name?: string;
  contact_type?: string;
  customer_sub_type?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  notes?: string;
  status?: string;
  last_modified_time?: string;
  billing_address?: {
    address?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  contact_persons?: Array<{
    contact_person_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    is_primary_contact?: boolean;
  }>;
};

type ZohoEnvelope<T> = T & {
  code?: number;
  message?: string;
  page_context?: { page?: number; per_page?: number; has_more_page?: boolean };
};

export type ZohoOrganization = {
  organization_id: string;
  name?: string;
  currency_code?: string;
  is_default_org?: boolean;
};

/**
 * Thin Books v3 client bound to one tenant's access token + organisation.
 * `accessToken` is short lived — construct this per operation, never cache it.
 */
export class ZohoBooksClient {
  private readonly region: ZohoRegion;
  private readonly accessToken: string;
  private readonly organizationId: string | null;

  constructor(region: ZohoRegion, accessToken: string, organizationId?: string | null) {
    this.region = region;
    this.accessToken = accessToken;
    this.organizationId = organizationId ?? null;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<ZohoEnvelope<T>> {
    const query = new URLSearchParams();
    if (this.organizationId) query.set("organization_id", this.organizationId);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && `${v}`.length > 0) query.set(k, `${v}`);
    }
    const qs = query.toString();
    const url = `${apiHost(this.region)}/books/v3${path}${qs ? `?${qs}` : ""}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Zoho-oauthtoken ${this.accessToken}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch {
      throw new ZohoApiError("Could not reach Zoho Books.", 502);
    }

    if (res.status === 401) {
      throw new ZohoApiError("Zoho rejected the access token.", 401);
    }
    if (res.status === 429) {
      throw new ZohoApiError(
        "Zoho's API rate limit was reached. Wait a minute and run the sync again.",
        429,
      );
    }

    let json: ZohoEnvelope<T>;
    try {
      json = (await res.json()) as ZohoEnvelope<T>;
    } catch {
      throw new ZohoApiError(`Zoho Books returned an unreadable response (HTTP ${res.status}).`, 502);
    }

    // Books signals success with code 0; anything else is an error even on 200.
    if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
      throw new ZohoApiError(
        json.message ?? `Zoho Books request failed (HTTP ${res.status}).`,
        res.ok ? 400 : res.status,
        json.code,
      );
    }
    return json;
  }

  /** Organisations the authorized user can access (no organization_id needed). */
  async listOrganizations(): Promise<ZohoOrganization[]> {
    const json = await this.request<{ organizations?: ZohoOrganization[] }>(
      "GET",
      "/organizations",
    );
    return json.organizations ?? [];
  }

  /** One page of customer contacts. */
  async listContacts(page: number, perPage = 200): Promise<{ contacts: ZohoContact[]; hasMore: boolean }> {
    const json = await this.request<{ contacts?: ZohoContact[] }>("GET", "/contacts", {
      query: { page, per_page: perPage, contact_type: "customer" },
    });
    return {
      contacts: json.contacts ?? [],
      hasMore: Boolean(json.page_context?.has_more_page),
    };
  }

  /**
   * Look up contacts by an exact field match. Used to ADOPT an existing Zoho
   * contact instead of creating a duplicate — Zoho enforces unique contact
   * names per organisation, so blind creates fail on the second run.
   */
  async searchContacts(params: {
    email?: string;
    phone?: string;
    contactName?: string;
  }): Promise<ZohoContact[]> {
    const query: Record<string, string> = {};
    if (params.email) query["email"] = params.email;
    if (params.phone) query["phone"] = params.phone;
    if (params.contactName) query["contact_name"] = params.contactName;
    if (Object.keys(query).length === 0) return [];
    const json = await this.request<{ contacts?: ZohoContact[] }>("GET", "/contacts", {
      query: { ...query, per_page: 25 },
    });
    return json.contacts ?? [];
  }

  async getContact(contactId: string): Promise<ZohoContact | null> {
    try {
      const json = await this.request<{ contact?: ZohoContact }>("GET", `/contacts/${contactId}`);
      return json.contact ?? null;
    } catch (err) {
      // A contact deleted in Zoho should not abort a sync run.
      if (err instanceof ZohoApiError && (err.status === 404 || err.code === 1002)) return null;
      throw err;
    }
  }

  async createContact(body: Record<string, unknown>): Promise<ZohoContact> {
    const json = await this.request<{ contact?: ZohoContact }>("POST", "/contacts", { body });
    if (!json.contact?.contact_id) {
      throw new ZohoApiError("Zoho Books did not return the created contact.", 502);
    }
    return json.contact;
  }

  async updateContact(contactId: string, body: Record<string, unknown>): Promise<ZohoContact> {
    const json = await this.request<{ contact?: ZohoContact }>("PUT", `/contacts/${contactId}`, {
      body,
    });
    if (!json.contact?.contact_id) {
      throw new ZohoApiError("Zoho Books did not return the updated contact.", 502);
    }
    return json.contact;
  }
}
