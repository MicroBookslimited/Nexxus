---
name: FSM in-app messaging
description: Thread model, access rules, and the two concurrency traps in office↔technician messaging
---

# Office ↔ technician messaging

Two thread kinds only: `direct` (one per technician ↔ office) and `job` (one per
work order). No technician-to-technician DMs; techs meet only inside a shared job
thread. Text only — there is deliberately no attachment column.

## The office is a collective identity

Any admin/manager/owner reads and replies in **every** thread. A technician's
question is never stuck with one person who is off shift.

**Why:** the whole point was to replace phone/WhatsApp, where a message to the
wrong person just sits there.

**How to apply:** `sender_side` is derived server-side from the staff row's role,
never sent by the client. Unread = messages newer than *my* cursor that *I* did
not send, so one admin's message is genuinely unread for another admin.

## Job-thread access is derived live, never stored

Membership is recomputed per request from the FSM queue's own assignment
predicate (the shared `assignedToStaff` helper), not from a members table.

**Why:** unassigning a technician must revoke access to the history too.

**How to apply:** reuse the exported predicate. Never fork a second copy of the
"is this tech on this job" SQL — the two will drift.

## Two concurrency traps (both bit, both fixed)

1. **Denormalized last-message preview can go backwards.** The thread row carries
   `last_message_id/at/preview/sender_name`, written in the send transaction, so
   the inbox is two queries instead of a `DISTINCT ON`. Two simultaneous sends
   race: the transaction carrying the *older* id can commit last and overwrite
   the newer preview, misordering the inbox. The update must be a compare-and-set
   — `WHERE last_message_id IS NULL OR last_message_id < <new id>`.

2. **A read cursor can be parked in the future.** Message ids are global across
   threads, so a client posting a `lastMessageId` from another thread advances
   its cursor past everything and permanently suppresses unread counts there.
   Cap any client-supplied cursor at `MAX(id)` of that thread's own messages.
   `GREATEST(...)` alone only stops rewinding — it does not stop over-advancing.

## Delivery is polling

5s incremental `afterId` while a thread is open, 15s inbox, 30s badge. There is
no realtime infra in this monorepo, and FSM ships as an Expo Go bundle so remote
push is not reliable — meaning **nothing notifies a user who has the app closed.**
Clients must merge incoming messages by id (an optimistic send plus a poll will
otherwise duplicate a row), and a react-query client keyed on `afterId` gets a
fresh key per poll, so gate any "loading" spinner on having zero messages.
