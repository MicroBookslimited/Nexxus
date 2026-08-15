---
name: Database outage resilience
description: How the API server survives its Postgres endpoint disappearing — boot never blocks on the DB, and the process must not be killed by connectivity errors.
---

# Database outage resilience

The API server must start, keep listening, and heal itself when its Postgres
endpoint is unreachable (suspended managed database, failover, network blip).

## Rules

1. **Nothing database-dependent may run as a bare top-level `await` in the
   server entrypoint.** A rejection there kills the process before the HTTP
   server binds, so a database blip takes every client surface offline and
   needs a manual restart. Schema repairs, additive DDL and seeds go through
   the startup-maintenance runner: each step guarded, failures logged, retried
   in the background with backoff, and the whole pre-listen pass bounded by a
   deadline so a *hung* socket can't blow the platform's port-open timeout.

2. **The pg `Pool` must always have an `error` listener.** An idle client that
   errors emits `'error'` on the pool; with no listener Node treats it as an
   unhandled `'error'` event and exits. This alone was a whole-app outage.

3. **Maintenance steps must be idempotent and single-flight.** A timeout only
   stops us *waiting* — it cannot abort a query already in flight. Retrying a
   step whose first attempt is still running can double-execute side effects
   (campaign resends). Keep the in-flight promise and dequeue the step when it
   settles, rather than re-invoking on timeout.

4. **A step that swallows its own errors can never be retried** — the runner
   sees success and drops it. Steps run by the runner must propagate failure.

5. **Connectivity errors ≠ query errors.** Classify by SQLSTATE/syscall and map
   only genuine unavailability to 503 (`DB_UNAVAILABLE`). Neon/Supabase report
   a suspended endpoint as SQLSTATE `28000`; `28P01` (bad password) is a
   persistent misconfiguration and must NOT be dressed up as a transient
   outage. Drizzle wraps driver errors, so walk the `cause` chain.

6. **Crash guards are asymmetric on purpose.** Unhandled rejections and
   uncaught *connectivity* errors are logged and survived; any other uncaught
   exception still exits(1) for a clean supervisor restart, because process
   invariants are unknown after one.

7. **Liveness and readiness are different probes.** Liveness must not touch the
   database (otherwise an outage looks like a dead process); readiness pings it
   and returns 503 with the root-cause message when it can't be reached.

**Why:** a suspended database endpoint once crashed the server at boot and kept
POS web, POS mobile and FSM dark until someone restarted the workflow by hand.

**How to apply:** any new boot-time database work, pool creation, or
error-to-status mapping must follow these rules.
