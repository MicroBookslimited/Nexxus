---
name: FSM job queue visibility
description: Who sees which work orders in the technician app, and the custody exception that must survive status changes
---

# What the FSM queue shows

The technician queue is deliberately a *live work* list, not a history: a job
leaves it the moment work is marked complete. Two reasons, both from the
customer: clutter, and not leaving customer names, addresses and phone numbers
sitting on a personal phone after the visit. Office roles (admin/manager/owner)
are the opposite — they see every job in the tenant at every status, closed ones
included, parked below the live work.

## The custody exception

A finished job stays on the technician's list while company property is still
signed out on it — an unreturned returnable allocation, or a return they
declared that no manager has signed yet.

**Why:** the hand-back flow lives *inside* the job screen. Hiding the job the
instant work completes would strand the tools with no route to return them.

**How to apply:** the custody test must sit OUTSIDE the active-status test, not
inside it. The office routinely moves a finished job on to a closed status while
the tools are still in the van; an `AND active_status` would silently drop it.
Cancelled jobs are the only exception.

A declared return is personal to the technician who declared it, so that half of
the test filters on the declaring staff id. Allocations have no custodian column,
so the tool half is job-level — on a multi-technician job every assignee keeps
seeing it until the tools are back. Recording a custodian per allocation is the
fix if that ever matters.

## Detail access is deliberately wider than the list

Removing a job from the list does not revoke it. The per-job endpoints stay
assignment-scoped only, so a completed job is still reachable by id — sign-off,
photos, payments and the tool hand-back all happen after completion. Treat the
list filter as navigation, not as the authorization boundary.
