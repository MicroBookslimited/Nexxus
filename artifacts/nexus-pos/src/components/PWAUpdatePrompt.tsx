import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-4 py-3 shadow-2xl"
      style={{ maxWidth: 340 }}
    >
      <RefreshCw className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Update available</p>
        <p className="text-xs text-muted-foreground">A new version of NEXXUS POS is ready.</p>
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 text-xs font-semibold bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors"
      >
        Update
      </button>
    </div>
  );
}
