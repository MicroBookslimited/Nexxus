import { lazy, Suspense, useEffect, useState } from "react";
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
import { VerifyEmail } from "@/pages/verify-email";
import { AdminInvitePage } from "@/pages/admin-invite";
import { Locations } from "@/pages/locations";
import { Accounting } from "@/pages/accounting";
import { AccountsReceivable } from "@/pages/ar";
import { AccountsPayable } from "@/pages/accounts-payable";
import { AuditTrail } from "@/pages/audit";
import { Ingredients } from "@/pages/ingredients";
import { Recipes } from "@/pages/recipes";
import { Production } from "@/pages/production";
import { MyHardware } from "@/pages/my-hardware";
import StorePage from "@/pages/store";
import { Register } from "@/pages/register";
import { TopUp } from "@/pages/topup";
import { ScalePage } from "@/pages/scale";
import { Layout, PermissionGate } from "@/components/layout";

// ─── Lazy section imports ───────────────────────────────────────────────────
const Landing = lazy(() => import("@/sections/landing/Landing"));
const CustomerDisplay = lazy(() => import("@/sections/customer-display/CustomerDisplay"));
const Menu = lazy(() => import("@/sections/menu/Menu"));
const Reseller = lazy(() => import("@/sections/reseller/Reseller"));

// ─── Section fallback spinner ───────────────────────────────────────────────
function SectionSpinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0f1729" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(59,130,246,0.3)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Top-level section router ───────────────────────────────────────────────
// Dispatches to the correct section based on URL path prefix.
// Each section manages its own internal router.
function SectionDispatch() {
  const path = window.location.pathname;

  if (path.startsWith("/customer-display")) {
    return (
      <Suspense fallback={<SectionSpinner />}>
        <CustomerDisplay />
      </Suspense>
    );
  }

  if (path.startsWith("/menu")) {
    return (
      <Suspense fallback={<SectionSpinner />}>
        <Menu />
      </Suspense>
    );
  }

  if (path.startsWith("/reseller")) {
    return (
      <Suspense fallback={<SectionSpinner />}>
        <Reseller />
      </Suspense>
    );
  }

  // Standalone pages that live outside the /app Wouter base
  if (path.startsWith("/superadmin")) return <Superadmin />;
  if (path.startsWith("/signup"))     return <Onboarding />;
  if (path.startsWith("/reset-password")) return <ResetPassword />;
  if (path.startsWith("/verify-email"))   return <VerifyEmail />;

  if (path.startsWith("/app")) {
    return <POSApp />;
  }

  // Default: landing page at "/"
  return (
    <Suspense fallback={<SectionSpinner />}>
      <Landing />
    </Suspense>
  );
}

// ─── POS app internals ──────────────────────────────────────────────────────

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

function POSRouter() {
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
      <Route path="/ap"><ProtectedRoute component={AccountsPayable} permission="reports.view" /></Route>
      <Route path="/ingredients"><ProtectedRoute component={Ingredients} permission="inventory.manage" /></Route>
      <Route path="/recipes"><ProtectedRoute component={Recipes} permission="inventory.manage" /></Route>
      <Route path="/production"><ProtectedRoute component={Production} permission="inventory.manage" /></Route>
      <Route path="/hardware"><ProtectedRoute component={MyHardware} permission="settings.view" /></Route>
      <Route path="/audit"><ProtectedRoute component={AuditTrail} permission="reports.view" /></Route>
      <Route path="/cash"><ProtectedRoute component={CashManagement} permission="cash.open_session" /></Route>
      <Route path="/register"><ProtectedRoute component={Register} permission="reports.view" /></Route>
      <Route path="/topup"><ProtectedRoute component={TopUp} permission="pos.sale" /></Route>
      <Route path="/scale"><ProtectedRoute component={ScalePage} permission="scale.use" /></Route>
      <Route path="/store"><ProtectedRoute component={StorePage} /></Route>
      <Route path="/settings"><ProtectedRoute component={AdminSettings} permission="settings.view" /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} permission="settings.manage" /></Route>
      <Route path="/signup" component={Onboarding} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/admin-invite" component={AdminInvitePage} />
      <Route path="/superadmin" component={Superadmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

const fsSupported = typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";

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

function POSApp() {
  useAutoFullscreen();

  return (
    <ThemeProvider>
      <StaffProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <TooltipProvider>
            <WouterRouter base="/app">
              <POSRouter />
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

// ─── Root App ───────────────────────────────────────────────────────────────
export default function App() {
  return <SectionDispatch />;
}
