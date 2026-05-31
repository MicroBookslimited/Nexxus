import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import React, { createContext, useContext, useEffect, useState } from "react";

import { loadToken, login, setToken, TENANT_KEY, type LoginResponse } from "@/lib/nexus-api";

type Tenant = LoginResponse["tenant"];
type Subscription = NonNullable<LoginResponse["subscription"]>;

const SUBSCRIPTION_KEY = "nexus_subscription_info";

interface AuthState {
  token: string | null;
  tenant: Tenant | null;
  subscription: Subscription | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await loadToken();
        const raw = await AsyncStorage.getItem(TENANT_KEY);
        const sub = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
        setTokenState(t);
        setTenant(raw ? (JSON.parse(raw) as Tenant) : null);
        setSubscription(sub ? (JSON.parse(sub) as Subscription) : null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const res = await login(email, password);
    // Drop any cached data from a prior tenant before the new token is live.
    queryClient.clear();
    await setToken(res.token);
    await AsyncStorage.setItem(TENANT_KEY, JSON.stringify(res.tenant));
    setTokenState(res.token);
    setTenant(res.tenant);
    if (res.subscription) {
      await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(res.subscription));
      setSubscription(res.subscription);
    } else {
      await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
      setSubscription(null);
    }
  };

  const signOut = async () => {
    await setToken(null);
    await AsyncStorage.removeItem(TENANT_KEY);
    await AsyncStorage.removeItem(SUBSCRIPTION_KEY);
    setTokenState(null);
    setTenant(null);
    setSubscription(null);
    // Prevent the next account from briefly seeing this tenant's cached data.
    queryClient.clear();
  };

  return (
    <AuthCtx.Provider value={{ token, tenant, subscription, isLoading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
