import { useEffect, useState, useCallback, useRef } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getQueue, flushQueue } from "@/lib/offline-queue";
import { queryClient } from "@/lib/query-persister";
import { Wifi, WifiOff, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "done" | "failed";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [queueCount, setQueueCount] = useState(() => getQueue().length);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncResult, setSyncResult] = useState<{ succeeded: number; failed: number } | null>(null);
  // Track whether we already auto-triggered a sync for this "came-back-online" event
  const autoSyncedRef = useRef(false);

  const refreshCount = useCallback(() => {
    setQueueCount(getQueue().length);
  }, []);

  useEffect(() => {
    window.addEventListener("nexus:queue-changed", refreshCount);
    return () => window.removeEventListener("nexus:queue-changed", refreshCount);
  }, [refreshCount]);

  const handleFlush = useCallback(async () => {
    if (syncState === "syncing") return;
    setSyncState("syncing");
    setSyncResult(null);
    try {
      const result = await flushQueue();
      const remaining = getQueue().length;
      setSyncResult(result);
      setQueueCount(remaining);
      if (result.succeeded > 0) {
        await queryClient.invalidateQueries();
      }
      if (result.failed > 0) {
        setSyncState("failed");
      } else {
        setSyncState("done");
        setTimeout(() => setSyncState("idle"), 4000);
      }
    } catch {
      setSyncState("failed");
    }
  }, [syncState]);

  // Auto-sync once when we come back online and there are items queued.
  // Uses a ref to prevent re-triggering after a failed sync (until offline/online cycles again).
  useEffect(() => {
    if (!isOnline) {
      // Reset the auto-sync gate whenever we go offline
      autoSyncedRef.current = false;
      setSyncState("idle");
      return;
    }
    if (isOnline && queueCount > 0 && !autoSyncedRef.current && syncState === "idle") {
      autoSyncedRef.current = true;
      handleFlush();
    }
  }, [isOnline, queueCount, syncState, handleFlush]);

  if (isOnline && queueCount === 0 && syncState === "idle") return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium shadow-lg transition-all",
        !isOnline
          ? "bg-amber-500 text-amber-950"
          : syncState === "done"
          ? "bg-green-600 text-white"
          : syncState === "failed"
          ? "bg-red-600 text-white"
          : "bg-blue-600 text-white"
      )}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              You're offline — changes will sync automatically when your connection returns.
              {queueCount > 0 && ` (${queueCount} pending)`}
            </span>
          </>
        ) : syncState === "syncing" ? (
          <>
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
            <span>Syncing {queueCount} queued sale{queueCount !== 1 ? "s" : ""}…</span>
          </>
        ) : syncState === "done" ? (
          <>
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>
              {syncResult?.succeeded} sale{syncResult?.succeeded !== 1 ? "s" : ""} synced successfully.
            </span>
          </>
        ) : syncState === "failed" ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {syncResult && syncResult.succeeded > 0
                ? `${syncResult.succeeded} synced, ${syncResult.failed} failed to sync.`
                : `${queueCount} sale${queueCount !== 1 ? "s" : ""} failed to sync — tap Retry.`}
            </span>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0" />
            <span>{queueCount} sale{queueCount !== 1 ? "s" : ""} waiting to sync.</span>
          </>
        )}
      </div>

      {isOnline && queueCount > 0 && (syncState === "idle" || syncState === "failed") && (
        <button
          onClick={() => {
            autoSyncedRef.current = true;
            handleFlush();
          }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {syncState === "failed" ? "Retry" : "Sync now"}
        </button>
      )}
    </div>
  );
}
