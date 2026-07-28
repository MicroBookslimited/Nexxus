import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";

export const CACHE_KEY = "nexus_query_cache";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 60 * 5,
      retry: (failureCount, error: unknown) => {
        if (error instanceof TypeError && error.message.includes("fetch")) {
          return false;
        }
        return failureCount < 2;
      },
    },
    // NEVER retry mutations automatically. A checkout POST whose response is
    // lost (flaky network) may have already been persisted server-side — an
    // automatic retry would create a duplicate order. Reads are safe to
    // retry; writes are not.
    mutations: {
      retry: false,
    },
  },
});

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: CACHE_KEY,
  throttleTime: 1000,
});

/** Call on every login/logout to prevent one tenant seeing another tenant's cached data. */
export function clearQueryCache() {
  queryClient.clear();
  localStorage.removeItem(CACHE_KEY);
}
