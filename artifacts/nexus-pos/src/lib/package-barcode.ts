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
