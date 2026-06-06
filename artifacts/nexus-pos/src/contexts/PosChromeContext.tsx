import { createContext, useContext, useState, type ReactNode } from "react";

type PosChromeContextValue = {
  /** When true, the global top navigation header is hidden on the POS screen. */
  headerHidden: boolean;
  toggleHeader: () => void;
  setHeaderHidden: (v: boolean) => void;
};

const PosChromeContext = createContext<PosChromeContextValue | undefined>(undefined);

/**
 * Shares the "hide the global top header on the POS screen" toggle between the
 * Layout (which renders the header) and the POS pages (which render the toggle
 * button on their own status bar). Defaults to hidden for a cleaner cashing view.
 */
export function PosChromeProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(true);
  return (
    <PosChromeContext.Provider
      value={{ headerHidden, toggleHeader: () => setHeaderHidden((v) => !v), setHeaderHidden }}
    >
      {children}
    </PosChromeContext.Provider>
  );
}

export function usePosChrome() {
  const ctx = useContext(PosChromeContext);
  if (!ctx) throw new Error("usePosChrome must be used within a PosChromeProvider");
  return ctx;
}
