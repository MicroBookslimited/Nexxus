/**
 * Minimal server-side Shopify Admin API (GraphQL) client. Built per-tenant from
 * a stored connection (shop domain + decrypted Admin API access token + a
 * configurable API version). No deprecated REST endpoints and no hardcoded
 * API version — the version comes from the tenant's connection so it can be
 * bumped without code changes.
 */

export interface ShopifyClientConfig {
  shopDomain: string;
  accessToken: string;
  apiVersion: string;
}

export interface ShopifyGraphqlResult<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export class ShopifyApiError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
  }
}

/** Normalize a user-entered shop domain to the canonical `*.myshopify.com` host. */
export function normalizeShopDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Bare handle -> append the permanent domain.
  if (!d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

/** True for a syntactically valid permanent Shopify domain. */
export function isValidShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

export interface ClientCredentialsGrant {
  /** Short-lived Admin API access token (shpat_…). */
  accessToken: string;
  /** Seconds until the token expires (Shopify returns ~86399 = 24h). */
  expiresInSec: number;
}

/**
 * Exchange a Dev Dashboard app's Client ID + Client Secret for a short-lived
 * Admin API access token via the OAuth Client Credentials grant. This is the
 * only credential path Shopify allows for custom apps created after
 * Jan 1, 2026 (static `shpat_` tokens can no longer be generated in the store
 * admin). The returned token must be cached and re-exchanged before expiry.
 */
export async function exchangeClientCredentials(
  shopDomain: string,
  clientId: string,
  clientSecret: string,
): Promise<ClientCredentialsGrant> {
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/oauth/access_token`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    if (resp.status === 401 || resp.status === 400) {
      throw new ShopifyApiError(
        "Shopify rejected the Client ID / Client Secret. Double-check both values and that the app is installed on this store.",
        resp.status,
      );
    }
    throw new ShopifyApiError(
      `Shopify token exchange failed (${resp.status}): ${text.slice(0, 300)}`,
      resp.status,
    );
  }

  const json = (await resp.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new ShopifyApiError("Shopify token exchange returned no access token.", 500);
  }
  return {
    accessToken: json.access_token,
    expiresInSec: typeof json.expires_in === "number" ? json.expires_in : 86399,
  };
}

export class ShopifyAdminClient {
  private readonly endpoint: string;
  private readonly accessToken: string;

  constructor(config: ShopifyClientConfig) {
    const domain = normalizeShopDomain(config.shopDomain);
    this.endpoint = `https://${domain}/admin/api/${config.apiVersion}/graphql.json`;
    this.accessToken = config.accessToken;
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": this.accessToken,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      if (resp.status === 401 || resp.status === 403) {
        throw new ShopifyApiError(
          "Shopify rejected the access token (unauthorized). Check the token and its scopes.",
          resp.status,
        );
      }
      throw new ShopifyApiError(
        `Shopify API request failed (${resp.status}): ${text.slice(0, 300)}`,
        resp.status,
      );
    }

    const json = (await resp.json()) as ShopifyGraphqlResult<T>;
    if (json.errors && json.errors.length > 0) {
      throw new ShopifyApiError(
        `Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
        400,
      );
    }
    if (!json.data) {
      throw new ShopifyApiError("Shopify returned no data", 500);
    }
    return json.data;
  }

  /**
   * Verify the credentials by fetching the shop. Returns the shop's display
   * name and a few useful fields. Throws ShopifyApiError on failure.
   */
  async testConnection(): Promise<{
    name: string;
    myshopifyDomain: string;
    email: string | null;
    currencyCode: string | null;
    planDisplayName: string | null;
  }> {
    const data = await this.graphql<{
      shop: {
        name: string;
        myshopifyDomain: string;
        email: string | null;
        currencyCode: string | null;
        plan: { displayName: string | null } | null;
      };
    }>(
      `query {
        shop {
          name
          myshopifyDomain
          email
          currencyCode
          plan { displayName }
        }
      }`,
    );
    return {
      name: data.shop.name,
      myshopifyDomain: data.shop.myshopifyDomain,
      email: data.shop.email,
      currencyCode: data.shop.currencyCode,
      planDisplayName: data.shop.plan?.displayName ?? null,
    };
  }
}
