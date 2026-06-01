import { useEffect, useState } from "react";
import { Printer, Plug, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  isWebUsbSupported,
  getUsbPrintConfig,
  setUsbPrintEnabled,
  requestUsbPrinter,
  getSavedUsbPrinter,
  testUsbPrint,
  describeUsbDevice,
} from "@/lib/escpos-usb";

interface UsbPrinterSettingsProps {
  /** Tenant receipt width ("58mm" | "80mm"); controls ESC/POS column count. */
  receiptSize?: string;
}

/**
 * Device-local USB thermal-printer setup. WebUSB permission and the chosen
 * printer are stored per-browser (localStorage), NOT in tenant settings — each
 * terminal may have a different printer (or none).
 */
export function UsbPrinterSettings({ receiptSize }: UsbPrinterSettingsProps) {
  const supported = isWebUsbSupported();
  const [enabled, setEnabled] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(getUsbPrintConfig().enabled);
    if (!supported) return;
    getSavedUsbPrinter()
      .then((d) => setDeviceLabel(d ? describeUsbDevice(d) : null))
      .catch(() => setDeviceLabel(null));
  }, [supported]);

  function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    setUsbPrintEnabled(next);
  }

  async function handleConnect() {
    setBusy(true);
    try {
      const device = await requestUsbPrinter();
      setDeviceLabel(describeUsbDevice(device));
      setEnabled(true);
      toast({
        title: "USB printer connected",
        description: describeUsbDevice(device),
      });
    } catch (err) {
      // User cancelling the chooser throws too — keep that quiet.
      const message = err instanceof Error ? err.message : String(err);
      if (!/no device selected|cancell?ed/i.test(message)) {
        toast({ title: "Could not connect printer", description: message, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      await testUsbPrint({ receipt_size: receiptSize });
      toast({ title: "Test sent", description: "Check the printer for the test slip." });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Test print failed", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <Printer className="h-4 w-4" />
            USB thermal printer (ESC/POS) — this device only
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sends receipts as raw ESC/POS commands straight to a USB thermal printer (e.g. 3nStar
            RPT004). This is the reliable way to print on thermal hardware — the standard print
            dialog rasterizes the receipt and many thermal printers print it blank. Connect the
            printer below; the choice is remembered on this device. When off, the standard browser
            print dialog is used.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={!supported}
          onClick={toggleEnabled}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            enabled ? "bg-teal-500" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform",
              enabled ? "translate-x-5" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {!supported ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            USB printing needs Google Chrome opened directly on the device (it isn't available inside
            this preview frame). Open the published app in Chrome on the Android tablet to connect a
            printer.
          </span>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {deviceLabel ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                <span className="font-medium">Connected:</span>
                <span className="font-mono text-xs text-muted-foreground truncate">{deviceLabel}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No USB printer connected yet.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-teal-500 bg-teal-500/10 px-3 py-2 text-sm font-medium hover:bg-teal-500/20 disabled:opacity-50"
            >
              <Plug className="h-4 w-4" />
              {deviceLabel ? "Change USB printer" : "Connect USB printer"}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={busy || !deviceLabel}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:border-muted-foreground/40 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Test print
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: leave the printer set to its USB connection. You don't need any extra print-service
            app (raw BT / Looped Labs) — those are what crashed before.
          </p>
        </div>
      )}
    </div>
  );
}
