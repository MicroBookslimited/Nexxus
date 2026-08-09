---
name: Order-create idempotency
description: How duplicate checkout submissions are prevented and what still lacks protection
---
Duplicate orders came from React Query's GLOBAL retry policy applying to mutations (a lost checkout response was silently re-POSTed) plus offline-queue replays with no idempotency key.

Protection now in place for POST /orders:
- Web POS queryClient sets `mutations: { retry: false }` — never re-enable mutation retries globally.
- Every checkout attempt (web pos/hardware/supermarket, kitchen send, mobile) sends `clientRequestId` (UUID per attempt); the offline-queue body carries the same key across replays.
- Server: pre-tx lookup by (tenantId, clientRequestId), re-check inside the advisory-locked tx (throws DuplicateRequestError → returns EXISTING order as 201), unique index `orders_tenant_client_request_unique` as final backstop (NULLs allowed for legacy rows).

**How to apply:** any NEW order-creation path (new POS layout, online store, import) must send a clientRequestId or it re-opens the duplicate bug. Mobile uses a Hermes-safe fallback because crypto.randomUUID may be missing.

Known gap (architect review): POST /orders/:id/charge has NO idempotency key and does read-then-update with side effects (A/R, loyalty) not fully transactional — duplicate charge submissions can still double-apply effects.

**Multi-tap burst defeats clientRequestId:** real-world dup orders (3 creates within 15ms, distinct UUIDs) came from rapid taps entering the charge handler before React re-rendered the disabled/isPending button — each invocation mints a fresh clientRequestId, so server idempotency never matches. Fix: synchronous `chargeInFlightRef` re-entry guard in ALL checkout handlers (mobile charge(), web pos/hardware/supermarket). Guard must be released on every path: mobile uses try/finally; web clears in onSettled AND a try/catch around the synchronous post-guard section (a sync throw before the mutation is accepted would otherwise dead-lock checkout). Any NEW checkout path needs the same guard, not just an isPending-disabled button.
