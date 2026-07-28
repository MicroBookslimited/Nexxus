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
