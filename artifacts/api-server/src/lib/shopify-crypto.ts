import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for Shopify Admin API access tokens (and the webhook
 * signing secret). Tokens are stored encrypted at rest and never returned to
 * the client.
 *
 * Key material: a dedicated `SHOPIFY_TOKEN_ENC_KEY` secret is used when set
 * (recommended — 64 hex chars / 32 bytes, or any string which is then run
 * through scrypt). If it is absent we derive a key from `SESSION_SECRET` via
 * scrypt with an app-specific salt so the feature works out of the box.
 *
 * NOTE: because the fallback is derived from SESSION_SECRET, rotating
 * SESSION_SECRET will make previously-stored tokens undecryptable (tenants
 * would simply reconnect). Set SHOPIFY_TOKEN_ENC_KEY to decouple the two.
 */

const SCRYPT_SALT = "nexus-shopify-token-v1";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const dedicated = process.env["SHOPIFY_TOKEN_ENC_KEY"];
  if (dedicated && dedicated.length > 0) {
    // Accept a 32-byte key supplied as 64 hex chars; otherwise stretch via scrypt.
    if (/^[0-9a-fA-F]{64}$/.test(dedicated)) {
      cachedKey = Buffer.from(dedicated, "hex");
    } else {
      cachedKey = crypto.scryptSync(dedicated, SCRYPT_SALT, 32);
    }
    return cachedKey;
  }

  const sessionSecret = process.env["SESSION_SECRET"];
  if (sessionSecret && sessionSecret.length > 0) {
    cachedKey = crypto.scryptSync(sessionSecret, SCRYPT_SALT, 32);
    return cachedKey;
  }

  throw new Error(
    "Cannot encrypt Shopify token: set SHOPIFY_TOKEN_ENC_KEY (or SESSION_SECRET).",
  );
}

/** Encrypt a plaintext string. Returns "v1:<ivB64>:<tagB64>:<cipherB64>". */
export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Decrypt a value produced by {@link encryptToken}. Throws on tamper/bad key. */
export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted token");
  }
  const key = deriveKey();
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const enc = Buffer.from(parts[3]!, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Verify the HMAC on a Shopify OAuth redirect (authorize callback). This is
 * DISTINCT from {@link verifyWebhookHmac}: webhooks sign the raw body and return
 * a base64 digest in a header, whereas OAuth signs the query string.
 *
 * Algorithm (per Shopify docs): take all query params EXCEPT `hmac` and
 * `signature`, sort them lexicographically by key, join as `key=value` pairs
 * with `&`, compute a hex SHA-256 HMAC with the app's Client Secret, and
 * timing-safe-compare it to the supplied `hmac` param.
 *
 * IMPORTANT: this function operates on the *raw* (URL-encoded) query string,
 * not on decoded Express `req.query` values. Shopify signs the bytes it sends
 * over the wire; if we decode first (e.g. `%2F` → `/`) and then recompute, the
 * digest will not match for any param value that contains percent-encoded chars
 * (e.g. `host` values with embedded `/`).
 *
 * @param rawQueryString The raw query string portion of the callback URL
 *   (everything after the first `?`, *before* any URL decoding). Express
 *   exposes this via `req.url.split("?", 2)[1] ?? ""`.
 */
export function verifyOAuthHmac(
  rawQueryString: string,
  secret: string,
): boolean {
  // Split on literal `&` — no URL-decoding. Each element is a raw "key=value"
  // token exactly as Shopify constructed it.
  const pairs = rawQueryString.split("&");

  // Extract the raw hmac value (everything after "hmac=").
  const hmacPair = pairs.find((p) => p === "hmac" || p.startsWith("hmac="));
  if (!hmacPair) return false;
  const provided = hmacPair.startsWith("hmac=") ? hmacPair.slice(5) : "";
  if (provided.length === 0) return false;

  // Build the message from every pair whose key is NOT hmac or signature.
  // Keys are already sorted after the split, but Shopify requires us to sort
  // the pairs ourselves — do it over the raw strings.
  const message = pairs
    .filter((p) => !p.startsWith("hmac=") && !p.startsWith("signature="))
    .sort()
    .join("&");

  const digest = crypto.createHmac("sha256", secret).update(message).digest("hex");

  // Timing-safe comparison. Both sides are hex strings, so length mismatch is
  // a valid early-exit (not a timing oracle here).
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify a Shopify webhook HMAC. Shopify signs the raw request body with the
 * app's API secret key (base64-encoded SHA-256 HMAC in the
 * `X-Shopify-Hmac-Sha256` header). Used in a later phase; included now so the
 * client surface is complete.
 */
export function verifyWebhookHmac(
  rawBody: Buffer | string,
  hmacHeader: string | undefined,
  secret: string,
): boolean {
  if (!hmacHeader) return false;
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const digest = crypto.createHmac("sha256", secret).update(body).digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
