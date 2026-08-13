/**
 * Remembers the technician's Bluetooth printer choice (device + paper width)
 * on the device itself, so it survives app restarts and never needs a trip to
 * the office to reconfigure.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_PRINTER_CONFIG, type PrinterConfig } from "@/lib/escpos";

const STORAGE_KEY = "nexus_fsm_printer_config";

interface PrinterState {
  config: PrinterConfig;
  ready: boolean;
  update: (patch: Partial<PrinterConfig>) => void;
}

const PrinterCtx = createContext<PrinterState | null>(null);

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PrinterConfig>({ ...DEFAULT_PRINTER_CONFIG, transport: "bluetooth" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PrinterConfig>;
          setConfig({ ...DEFAULT_PRINTER_CONFIG, ...parsed, transport: "bluetooth" });
        }
      } catch {
        /* ignore corrupt config */
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const update = useMemo(
    () => (patch: Partial<PrinterConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch, transport: "bluetooth" as const };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  return <PrinterCtx.Provider value={{ config, ready, update }}>{children}</PrinterCtx.Provider>;
}

export function usePrinter(): PrinterState {
  const ctx = useContext(PrinterCtx);
  if (!ctx) throw new Error("usePrinter must be used within PrinterProvider");
  return ctx;
}
