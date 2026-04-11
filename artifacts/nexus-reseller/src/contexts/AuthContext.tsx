import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getMe, clearToken, ResellerProfile } from "@/lib/api";

type AuthCtx = {
  reseller: ResellerProfile | null;
  loading: boolean;
  setReseller: (r: ResellerProfile | null) => void;
  logout: () => void;
};

const Ctx = createContext<AuthCtx>({
  reseller: null,
  loading: true,
  setReseller: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [reseller, setResellerState] = useState<ResellerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then(setResellerState)
      .catch(() => setResellerState(null))
      .finally(() => setLoading(false));
  }, []);

  const setReseller = (r: ResellerProfile | null) => setResellerState(r);

  const logout = () => {
    clearToken();
    setResellerState(null);
  };

  return <Ctx.Provider value={{ reseller, loading, setReseller, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
