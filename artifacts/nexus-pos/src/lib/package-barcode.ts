// Helpers for parcel barcode scans.
//
// Shipping labels carry several barcodes and some scanners split a single
// GS1-128 scan into multiple "chunks". Two patterns matter to us:
//  - Routing-only chunks: "420" + 5- or 9-digit destination ZIP, with no
//    tracking digits at all. These identify nothing and must be ignored.
//  - Prefixed tracking scans: "420" + ZIP followed by the tracking number.
//    Strip the routing prefix so we store/search the printed number.

/** True when the scan is only a USPS routing barcode chunk (420 + ZIP). */
export function isRoutingOnlyBarcode(raw: string): boolean {
  return /^420(?:\d{5}|\d{9})$/.test(raw.trim());
}

/** Strip a USPS "420"+ZIP routing prefix from a scanned tracking barcode. */
export function cleanScannedTracking(raw: string): string {
  const code = raw.trim();
  const m = code.match(/^420(?:\d{9}|\d{5})(9\d{21,})$/);
  return m ? m[1]! : code;
}

/**
 * Pull a recognizable tracking number out of a messy scan buffer.
 *
 * Some scanners emit the IMpb barcode in several keystroke bursts (routing
 * chunk, ZIP+4 fragment, then the tracking digits in groups), sometimes with
 * spaces and no Enter. The buffer can end up like "31069400108106244289839561"
 * or "9400 1081 0624 4289 8395 61". Rather than demanding an exact format,
 * find a USPS (9 + 21-25 digits) or Amazon (TBA…) tracking number anywhere in
 * the whitespace-stripped text. Returns null when none is present.
 */
export function extractTracking(raw: string): string | null {
  const code = cleanScannedTracking(raw.replace(/\s+/g, ""));
  const m = code.match(/9\d{21,25}|TBA\w{10,}/i);
  return m ? m[0]! : null;
}

/**
 * Heuristic: does this look like a scanned parcel code of ANY courier?
 *
 * extractTracking only recognizes USPS/Amazon formats, but parcels arrive with
 * GoFo (GFUS…), FedEx (12 digits), UPS (1Z…), SpeedX (SPX…), DHL and other
 * numbers. Any longish unbroken alphanumeric string is scan-like — humans
 * searching type shorter fragments or words with spaces. Used to auto-run the
 * package lookup when a scanner doesn't send a trailing Enter.
 */
export function looksLikeTrackingCode(raw: string): boolean {
  const code = raw.trim();
  if (code.length < 10 || /\s/.test(code)) return false;
  if (isRoutingOnlyBarcode(code)) return false;
  // Weight-embedded EAN-13 labels ("2" + 12 digits) are scale barcodes, not parcels.
  if (/^2\d{12}$/.test(code)) return false;
  return /^[A-Za-z0-9-]+$/.test(code);
}
