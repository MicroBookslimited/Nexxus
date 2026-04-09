import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface StaffSession {
  id: number;
  name: string;
  role: string;
  permissions: string[];
}

interface StaffContextValue {
  staff: StaffSession | null;
  setStaff: (staff: StaffSession | null) => void;
  can: (permission: string) => boolean;
  clearStaff: () => void;
}

const StaffContext = createContext<StaffContextValue>({
  staff: null,
  setStaff: () => {},
  can: () => true,
  clearStaff: () => {},
});

const STAFF_SESSION_KEY = "nexus_staff_session";

export function StaffProvider({ children }: { children: ReactNode }) {
  const [staff, setStaffState] = useState<StaffSession | null>(() => {
    try {
      const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
      return raw ? (JSON.parse(raw) as StaffSession) : null;
    } catch {
      return null;
    }
  });

  const setStaff = (s: StaffSession | null) => {
    setStaffState(s);
    if (s) {
      sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(s));
    } else {
      sessionStorage.removeItem(STAFF_SESSION_KEY);
    }
  };

  const clearStaff = () => setStaff(null);

  const can = (permission: string): boolean => {
    if (!staff) return true;
    return staff.permissions.includes(permission);
  };

  return (
    <StaffContext.Provider value={{ staff, setStaff, can, clearStaff }}>
      {children}
    </StaffContext.Provider>
  );
}

export function useStaff() {
  return useContext(StaffContext);
}
