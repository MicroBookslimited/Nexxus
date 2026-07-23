import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_KITCHEN_PRINTER_CONFIG,
  DEFAULT_PRINTER_CONFIG,
  type KitchenPrinterConfig,
  type PrinterConfig,
} from "@/lib/escpos";

const STORAGE_KEY = "nexus_printer_config";

interface PrinterState {
  config: PrinterConfig;
  /** Kitchen printer config with defaults applied (never undefined). */
  kitchen: KitchenPrinterConfig;
  ready: boolean;
  update: (patch: Partial<PrinterConfig>) => void;
  updateKitchen: (patch: Partial<KitchenPrinterConfig>) => void;
}

const PrinterCtx = createContext<PrinterState | null>(null);

export function PrinterProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<PrinterConfig>(DEFAULT_PRINTER_CONFIG);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PrinterConfig>;
          setConfig({
            ...DEFAULT_PRINTER_CONFIG,
            ...parsed,
            kitchen: { ...DEFAULT_KITCHEN_PRINTER_CONFIG, ...(parsed.kitchen ?? {}) },
          });
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
        const next = { ...prev, ...patch };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const kitchen = config.kitchen ?? DEFAULT_KITCHEN_PRINTER_CONFIG;

  const updateKitchen = useMemo(
    () => (patch: Partial<KitchenPrinterConfig>) => {
      setConfig((prev) => {
        const next = {
          ...prev,
          kitchen: { ...DEFAULT_KITCHEN_PRINTER_CONFIG, ...(prev.kitchen ?? {}), ...patch },
        };
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  return (
    <PrinterCtx.Provider value={{ config, kitchen, ready, update, updateKitchen }}>
      {children}
    </PrinterCtx.Provider>
  );
}

export function usePrinter(): PrinterState {
  const ctx = useContext(PrinterCtx);
  if (!ctx) throw new Error("usePrinter must be used within PrinterProvider");
  return ctx;
}
