---
name: Duplicate product detection
description: How find-duplicates groups names and the Unicode pitfall in normalization.
---

# Duplicate product detection

`GET /products/find-duplicates` groups products by an order-insensitive
normalized **token key** (lowercase → NFKD accent strip → non-alphanumeric →
space → sort tokens) and a single **union-find over ALL products**: exact =
identical token key, similar = Levenshtein ratio ≥ threshold on the token key.

**Why one union-find over everything:** the prior version excluded members of an
exact group from the fuzzy pass, so a near-duplicate of an exact pair was
silently dropped. Never partition exact vs fuzzy into separate passes.

**Unicode pitfall:** the punctuation-stripping regex MUST be Unicode-aware
(`[^\p{L}\p{N}]+/gu`). A plain `[^a-z0-9]` collapses CJK/Cyrillic names to an
empty key and false-groups every non-Latin product together. Also guard the
empty key: names with no alphanumerics must never auto-group.

**How to apply:** keep detection (this endpoint) and the merge eligibility/merge
transaction (`POST /products/merge`) separate — merge logic was correct; only
detection was at fault. The O(n^2) fuzzy pass is bounded by a length-delta
short-circuit, fine for SMB catalogs.
