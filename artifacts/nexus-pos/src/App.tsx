import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persister } from "@/lib/query-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { StaffProvider } from "@/contexts/StaffContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import { Dashboard } from "@/pages/dashboard";
import { POS } from "@/pages/pos";
import { Orders } from "@/pages/orders";
import { Products } from "@/pages/products";
import { Customers } from "@/pages/customers";
import { Reports } from "@/pages/reports";
import { Tables } from "@/pages/tables";
import { Kitchen } from "@/pages/kitchen";
import { Staff } from "@/pages/staff";
import { CashManagement } from "@/pages/cash";
import { AdminSettings } from "@/pages/settings";
import { Onboarding } from "@/pages/onboarding";
import { Superadmin } from "@/pages/superadmin";
import { SubscriptionPage } from "@/pages/subscription";
import { ResetPassword } from "@/pages/reset-password";
import { Locations } from "@/pages/locations";
import { Accounting } from "@/pages/accounting";
import { AccountsReceivable } from "@/pages/ar";
import { Ingredients } from "@/pages/ingredients";
import { Recipes } from "@/pages/recipes";
import { Production } from "@/pages/production";
import { Layout, PermissionGate } from "@/components/layout";


function ProtectedRoute({ component: Component, permission }: { component: React.ComponentType<any>; permission?: string }) {
  return (
    <Layout>
      {permission ? (
        <PermissionGate permission={permission}>
          <Component />
        </PermissionGate>
      ) : (
        <Component />
      )}
    </Layout>
  );
}

function Router() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (location === "/") {
      setLocation("/login");
    }
  }, [location, setLocation]);

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/pos"><ProtectedRoute component={POS} permission="pos.sale" /></Route>
      <Route path="/orders"><ProtectedRoute component={Orders} permission="orders.view" /></Route>
      <Route path="/products"><ProtectedRoute component={Products} permission="inventory.view" /></Route>
      <Route path="/customers"><ProtectedRoute component={Customers} permission="customers.view" /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} permission="reports.view" /></Route>
      <Route path="/tables"><ProtectedRoute component={Tables} permission="orders.view" /></Route>
      <Route path="/kitchen"><ProtectedRoute component={Kitchen} permission="kitchen.view" /></Route>
      <Route path="/staff"><ProtectedRoute component={Staff} permission="staff.view" /></Route>
      <Route path="/locations"><ProtectedRoute component={Locations} permission="inventory.manage" /></Route>
      <Route path="/accounting"><ProtectedRoute component={Accounting} permission="reports.view" /></Route>
      <Route path="/ar"><ProtectedRoute component={AccountsReceivable} permission="reports.view" /></Route>
      <Route path="/ingredients"><ProtectedRoute component={Ingredients} permission="inventory.manage" /></Route>
      <Route path="/recipes"><ProtectedRoute component={Recipes} permission="inventory.manage" /></Route>
      <Route path="/production"><ProtectedRoute component={Production} permission="inventory.manage" /></Route>
      <Route path="/cash"><ProtectedRoute component={CashManagement} permission="cash.open_session" /></Route>
      <Route path="/settings"><ProtectedRoute component={AdminSettings} permission="settings.view" /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} permission="settings.manage" /></Route>
      <Route path="/signup" component={Onboarding} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/superadmin" component={Superadmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

const fsSupported = typeof document.documentElement.requestFullscreen === "function";

function useAutoFullscreen() {
  useEffect(() => {
    if (!fsSupported) return;
    const requestFs = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    const onFirstInteraction = () => {
      requestFs();
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
    };

    document.addEventListener("click", onFirstInteraction);
    document.addEventListener("keydown", onFirstInteraction);
    document.addEventListener("touchstart", onFirstInteraction);

    return () => {
      document.removeEventListener("click", onFirstInteraction);
      document.removeEventListener("keydown", onFirstInteraction);
      document.removeEventListener("touchstart", onFirstInteraction);
    };
  }, []);
}

function FullscreenFab() {
  const [isFs, setIsFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    if (!fsSupported) return;
    const onFsChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  if (!fsSupported || isFs) return null;

  return (
    <button
      title="Enter Fullscreen"
      onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
      style={{
        position: "fixed",
        bottom: "12px",
        right: "12px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        background: "rgba(59,130,246,0.85)",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: 600,
        cursor: "pointer",
        backdropFilter: "blur(4px)",
      }}
    >
      ⛶ Fullscreen
    </button>
  );
}

function App() {
  useAutoFullscreen();

  return (
    <ThemeProvider>
      <StaffProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
            <OfflineBanner />
            <PWAUpdatePrompt />
            <FullscreenFab />
          </TooltipProvider>
        </PersistQueryClientProvider>
      </StaffProvider>
    </ThemeProvider>
  );
}

export default App;
