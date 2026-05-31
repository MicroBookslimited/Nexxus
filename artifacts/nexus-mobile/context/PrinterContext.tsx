import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import { DEFAULT_PRINTER_CONFIG, type PrinterConfig } from "@/lib/escpos";

const STORAGE_KEY = "nexus_printer_config";

interface PrinterState {
  config: PrinterConfig;
  ready: boolean;
  update: (patch: Partial<PrinterConfig>) => void;
}

const PrinterCtx = createContext<PrinterState | null>(null);

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) setConfig({ ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) });
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
        const next = { ...prev, ...patch };
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
