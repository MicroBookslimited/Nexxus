import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface StaffSession {
  id: number;
  name: string;
  role: string;
}

interface StaffContextValue {
  staff: StaffSession | null;
  setStaff: (staff: StaffSession | null) => void;
  clearStaff: () => void;
  isLoading: boolean;
}

const STAFF_SESSION_KEY = "nexus_staff_session";

const StaffCtx = createContext<StaffContextValue | null>(null);

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaffState] = useState<StaffSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STAFF_SESSION_KEY);
        setStaffState(raw ? (JSON.parse(raw) as StaffSession) : null);
      } catch {
        setStaffState(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setStaff = (s: StaffSession | null) => {
    setStaffState(s);
    if (s) {
      void AsyncStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(s));
    } else {
      void AsyncStorage.removeItem(STAFF_SESSION_KEY);
    }
  };

  const clearStaff = () => setStaff(null);

  return (
    <StaffCtx.Provider value={{ staff, setStaff, clearStaff, isLoading }}>
      {children}
    </StaffCtx.Provider>
  );
}

export function useStaff(): StaffContextValue {
  const ctx = useContext(StaffCtx);
  if (!ctx) throw new Error("useStaff must be used within StaffProvider");
  return ctx;
}
