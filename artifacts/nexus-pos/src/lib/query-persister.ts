import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";

const CACHE_KEY = "nexus_query_cache";

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
  },
});

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: CACHE_KEY,
  throttleTime: 1000,
});
