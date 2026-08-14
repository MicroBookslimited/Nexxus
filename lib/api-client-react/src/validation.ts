/**
 * Shared email + phone validation helpers used by both the web POS and the
 * Expo mobile apps (no DOM or Node dependencies).
 *
 * Phone strategy: Jamaica-first (876 / 658), but any number that starts with
 * a recognised country-code prefix ("+") is accepted as international.
 */

// ─── Email ────────────────────────────────────────────────────────────────────

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/** True when `s` looks like a valid e-mail address. Empty string → false. */
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

/** Inline error message, or null when the value is acceptable. */
export function emailError(s: string, opts?: { required?: boolean }): string | null {
  const v = s.trim();
  if (!v) return opts?.required ? "Email is required" : null;
  return EMAIL_RE.test(v) ? null : "Enter a valid email address (e.g. jane@example.com)";
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/**
 * Strip everything that isn't a digit or a leading "+".
 * Returns the normalised string used for matching / display.
 */
export function normalisePhone(raw: string): string {
  const s = raw.trim();
  const stripped = s.replace(/[^\d+]/g, "");
  // Keep the leading "+" if present (international prefix)
  return stripped.startsWith("+") ? stripped : stripped.replace(/\+/g, "");
}

/**
 * Jamaica-first phone validator.
 *
 * Accepted formats (spaces, dashes, dots and parentheses are stripped first):
 *   Local 10-digit NANP:  8767654321  or  6587654321
 *   With country code 1:  18767654321 / +18767654321 / +1 876 765 4321
 *   Other JA country code: +8767654321
 *   Any international:    starts with "+" and has 7–15 digits total
 *
 * Rejected:
 *   Local 7-digit (too short to be unambiguous)
 *   10-digit Jamaican without 876/658 prefix (enforces local discipline)
 */
export function isValidPhone(raw: string): boolean {
  if (!raw.trim()) return false;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    // International — at least 7 digits after the "+"
    const d = digits.slice(1);
    return /^\d{7,15}$/.test(d);
  }
  // Must be 10 or 11 digits (with or without leading "1" country code)
  if (digits.length === 10) {
    return /^(876|658)\d{7}$/.test(digits);
  }
  if (digits.length === 11) {
    return /^1(876|658)\d{7}$/.test(digits);
  }
  return false;
}

/** Inline error message, or null when the value is acceptable. */
export function phoneError(raw: string, opts?: { required?: boolean; label?: string }): string | null {
  const v = raw.trim();
  const label = opts?.label ?? "Phone number";
  if (!v) return opts?.required ? `${label} is required` : null;
  return isValidPhone(v)
    ? null
    : `${label} doesn't look right. Try 876-XXX-XXXX, 658-XXX-XXXX, or +country-code-number`;
}

/**
 * Formats a Jamaican or NANP phone number for display.
 * 18761234567 → +1 (876) 123-4567
 * 8761234567  → (876) 123-4567
 * +44… stays as-is.
 */
export function formatPhone(raw: string): string {
  const s = raw.trim();
  const digits = s.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return s; // preserve as typed
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.slice(1, 4);
    const mid  = digits.slice(4, 7);
    const last = digits.slice(7);
    return `+1 (${area}) ${mid}-${last}`;
  }
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const mid  = digits.slice(3, 6);
    const last = digits.slice(6);
    return `(${area}) ${mid}-${last}`;
  }
  return s; // leave as-is if unrecognised
}

// ─── Address ──────────────────────────────────────────────────────────────────

export interface StructuredAddress {
  address:    string; // street / P.O. Box
  city:       string;
  state:      string; // parish in Jamaica
  postalCode: string;
}

/** One-line representation, omitting blank parts. */
export function formatAddress(a: Partial<StructuredAddress>): string {
  return [a.address, a.city, a.state, a.postalCode]
    .map((p) => p?.trim() ?? "")
    .filter(Boolean)
    .join(", ");
}

/** Returns field-level errors, or null per field when valid. */
export function addressErrors(a: Partial<StructuredAddress>, opts?: { requireStreet?: boolean }): Partial<Record<keyof StructuredAddress, string>> {
  const errs: Partial<Record<keyof StructuredAddress, string>> = {};
  if (opts?.requireStreet && !a.address?.trim()) errs.address = "Street address is required";
  return errs;
}
