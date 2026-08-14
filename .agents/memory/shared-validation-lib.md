---
name: Shared validation library
description: Phone/email/address validation helpers shared by POS web and FSM Expo apps — location, patterns, and wiring rules.
---

## Shared validators live in `lib/api-client-react/src/validation.ts`
Exported from `lib/api-client-react/src/index.ts` so both `@workspace/nexus-pos` and `@workspace/nexus-fsm` can import them as `@workspace/api-client-react`.

## Phone validation — Jamaica-first
- `isValidPhone(raw)` — accepts 876/658 10-digit local, 1+876/658 11-digit NANP, or any `+country` international number; rejects bare 7-digit local and 10-digit non-JA numbers.
- `phoneError(raw, opts?)` — returns a user-facing string or null; pass `{ required: true }` to flag empty strings.
- `formatPhone(raw)` — formats to `(876) 123-4567` or `+1 (876) 123-4567` for display; leaves international as-is.

## Email validation
- `isValidEmail(s)` — RFC-safe regex, rejects empty.
- `emailError(s, opts?)` — returns user-facing string or null; `{ required: true }` to flag empty.

## Address
- `StructuredAddress` interface: `address | city | state | postalCode`.
- `formatAddress(a)` — joins non-empty parts with `, `.
- `addressErrors(a, opts?)` — per-field errors (only `requireStreet` opt today).

## Wiring pattern (web POS)
Use `onBlur` to set a `touched` flag; compute the error inline before the Input; pass `className={err ? "border-destructive" : ""}` on the Input and render a `<p className="text-xs text-destructive">` below.
Also call `setTouched({ phone: true, email: true })` at the top of `handleSave` before checking, so the form validates on submit even if the user never blurred the field.

## Wiring pattern (Expo FSM)
Use `onBlur` prop on `TextInput` to set a touched flag; render a `<Text style={styles.fieldError}>` below the input when touched && error.
Also call `setTouched(true)` inside the mutation fn before calling the API so the mutation throw propagates the error message to the `error` state.

**Why:** No shared validation existed — both clients and the server were inconsistent. Centralising avoids drift between the two apps.
