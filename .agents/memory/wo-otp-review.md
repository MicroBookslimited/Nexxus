---
name: WO completion OTP & review emails
description: Email-OTP sign-off alternative and post-completion review flow on work orders
---
- OTP sign-off stores `completionSignature = 'otp-verified'` sentinel (+ completionVerifiedVia='otp') so ALL existing freeze predicates work unchanged. Every renderer of the signature (POS detail, PDF, FSM) must special-case the sentinel instead of treating it as an image.
- **Why:** reusing the signature column keeps the atomic one-shot claim and freeze logic in one place.
- OTP verify must validate hash + expiry + attempt-limit INSIDE the UPDATE where-clause (bound to the exact hash), or a concurrent resend/second verifier accepts a superseded code. Wrong-attempt increment is also hash-bound.
- Review-request email uses an atomic `reviewEmailSentAt IS NULL` claim; on send failure the claim is released so it can retry. Public review POST is one-per-WO via unique index + onConflictDoNothing.
- Pre-start gating: install-form PATCH and allocation runs/remarks edits are rejected server-side until `arrivedAt`; dispatch (allocation create) is deliberately un-gated (office stocks the van pre-arrival).
- estimatedMinutes is nullable — clients clearing the estimate must send `null`, not 0 (API rejects 0).
