import { useEffect, useState, useCallback } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { getQueue, flushQueue } from "@/lib/offline-queue";
import { queryClient } from "@/lib/query-persister";
import { Wifi, WifiOff, RefreshCw, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "done";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [queueCount, setQueueCount] = useState(() => getQueue().length);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncResult, setSyncResult] = useState<{ succeeded: number; failed: number } | null>(null);

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
      setSyncResult(result);
      setSyncState("done");
      setQueueCount(getQueue().length);
      if (result.succeeded > 0) {
        await queryClient.invalidateQueries();
      }
      setTimeout(() => setSyncState("idle"), 4000);
    } catch {
      setSyncState("idle");
    }
  }, [syncState]);

  useEffect(() => {
    if (isOnline && queueCount > 0 && syncState === "idle") {
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
          : syncState === "done" && syncResult?.failed === 0
          ? "bg-green-600 text-white"
          : syncState === "done"
          ? "bg-orange-500 text-white"
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
            <span>Syncing {queueCount} queued operation{queueCount !== 1 ? "s" : ""}…</span>
          </>
        ) : syncState === "done" ? (
          <>
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>
              {syncResult?.succeeded} operation{syncResult?.succeeded !== 1 ? "s" : ""} synced successfully.
              {syncResult?.failed ? ` ${syncResult.failed} failed — will retry.` : ""}
            </span>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0" />
            <span>{queueCount} operation{queueCount !== 1 ? "s" : ""} waiting to sync.</span>
          </>
        )}
      </div>

      {isOnline && queueCount > 0 && syncState === "idle" && (
        <button
          onClick={handleFlush}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors text-xs font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Sync now
        </button>
      )}
    </div>
  );
}
