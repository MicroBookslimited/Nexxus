---
name: generated react-query hooks — queryKey requirement
description: Passing query options (e.g. enabled) to a generated get-by-id hook needs an explicit queryKey to typecheck clean.
---

The Orval-generated get hooks in `@workspace/api-client-react` type their `query` option as a full `UseQueryOptions` (TanStack v5), where `queryKey` is REQUIRED. So `useGetX(id, { query: { enabled } })` raises TS2741 "Property 'queryKey' is missing".

Many existing nexus-pos call sites already do exactly this (`{ query: { enabled } }` with no queryKey) — those are part of the repo's pre-existing TS error set, not a green baseline. Don't copy them blindly.

**How to apply:** for NEW code, pass the key too:
`useGetX(id ?? 0, { query: { enabled: !!id, queryKey: getGetXQueryKey(id ?? 0) } })`.
The generated `getGet<Name>QueryKey(id)` helper is exported alongside the hook. Runtime already falls back to it, so this only satisfies the type — but it keeps new files clean.
