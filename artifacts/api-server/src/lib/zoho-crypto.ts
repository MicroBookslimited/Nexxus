import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for Zoho OAuth tokens (refresh + cached access token).
 * Tokens are stored encrypted at rest and are never returned to the client.
 *
 * Key material: a dedicated `ZOHO_TOKEN_ENC_KEY` secret is used when set
 * (recommended — 64 hex chars / 32 bytes, or any string which is then stretched
 * through scrypt). If it is absent we derive a key from `SESSION_SECRET` via
 * scrypt with an app-specific salt so the feature works out of the box.
 *
 * NOTE: because the fallback is derived from SESSION_SECRET, rotating
 * SESSION_SECRET makes previously-stored tokens undecryptable (tenants simply
 * reconnect). Set ZOHO_TOKEN_ENC_KEY to decouple the two.
 */

const SCRYPT_SALT = "nexus-zoho-token-v1";

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const dedicated = process.env["ZOHO_TOKEN_ENC_KEY"];
  if (dedicated && dedicated.length > 0) {
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

  throw new Error("Cannot encrypt Zoho token: set ZOHO_TOKEN_ENC_KEY (or SESSION_SECRET).");
}

/** Encrypt a plaintext string. Returns "v1:<ivB64>:<tagB64>:<cipherB64>". */
export function encryptZohoToken(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** Decrypt a value produced by {@link encryptZohoToken}. Throws on tamper/bad key. */
export function decryptZohoToken(payload: string): string {
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
