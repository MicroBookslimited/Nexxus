import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persister } from "@/lib/query-persister";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { StaffProvider } from "@/contexts/StaffContext";
import { PosChromeProvider } from "@/contexts/PosChromeContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import NotFound from "@/pages/not-found";
import { Login } from "@/pages/login";
import { Dashboard } from "@/pages/dashboard";
import { POS } from "@/pages/pos";
import { PosHardware } from "@/pages/pos-hardware";
import { PosSupermarket } from "@/pages/pos-supermarket";
import { useGetSettings } from "@workspace/api-client-react";
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
import BackupPage from "@/pages/backup";
import StorePage from "@/pages/store";
import { Register } from "@/pages/register";
import { TopUp } from "@/pages/topup";
const PriceManager = lazy(() => import("@/pages/price-manager"));
const Promotions = lazy(() => import("@/pages/promotions"));
const SupplierReturns = lazy(() => import("@/pages/supplier-returns"));
const Quotations = lazy(() => import("@/pages/quotations"));
const LayawayPage = lazy(() => import("@/pages/layaway"));
const WorkOrdersPage = lazy(() => import("@/pages/work-orders"));
const WorkOrderDetailPage = lazy(() => import("@/pages/work-order-detail"));
const WorkOrderPortalPage = lazy(() => import("@/pages/work-order-portal"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const PackagesPage = lazy(() => import("@/pages/packages"));
const GiftVouchers = lazy(() => import("@/pages/gift-vouchers"));
const Account = lazy(() => import("@/pages/account"));
const Support = lazy(() => import("@/pages/support/support"));
import { ClockPage } from "@/pages/clock";
import { ScalePage } from "@/pages/scale";
import { TechnicianRegister } from "@/pages/technician-register";
import { TechnicianLogin } from "@/pages/technician-login";
import { TechnicianPortal } from "@/pages/technician-portal";
import { Layout, PermissionGate } from "@/components/layout";
import { isPathAllowedForTechnician, isTechnicianRestricted } from "@/lib/tenant-token";
import { PinPad } from "@/components/PinPad";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  if (path.startsWith("/technician/register")) return <TechnicianRegister />;
  if (path.startsWith("/technician/login"))    return <TechnicianLogin />;
  if (path.startsWith("/technician"))          return <TechnicianPortal />;

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
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isTechnicianRestricted() && !isPathAllowedForTechnician(location)) {
      setLocation("/dashboard");
    }
  }, [location, setLocation]);

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

// Dispatches /pos to the standard POS, the Hardware Store layout, or the
// Supermarket (scan-only) layout based on tenant settings. All layouts use the
// same cart/pricing/checkout API hooks — only the UI differs. Supermarket takes
// precedence over Hardware when both flags are somehow set.
function PosModeDispatcher() {
  const { data: settings, isLoading } = useGetSettings();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (settings?.courier_ui_mode === "true") return <PosSupermarket enableNameSearch retailLayout courierLayout />;
  if (settings?.retail_ui_mode === "true") return <PosSupermarket enableNameSearch retailLayout />;
  if (settings?.supermarket_search_mode === "true") return <PosSupermarket enableNameSearch />;
  if (settings?.supermarket_ui_mode === "true") return <PosSupermarket />;
  if (settings?.hardware_ui_mode === "true") return <PosHardware />;
  return <POS />;
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
      <Route path="/pos"><ProtectedRoute component={PosModeDispatcher} permission="pos.sale" /></Route>
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
      <Route path="/backup"><ProtectedRoute component={BackupPage} permission="settings.manage" /></Route>
      <Route path="/audit"><ProtectedRoute component={AuditTrail} permission="reports.view" /></Route>
      <Route path="/support"><ProtectedRoute component={Support} /></Route>
      <Route path="/cash"><ProtectedRoute component={CashManagement} permission="cash.open_session" /></Route>
      <Route path="/clock"><ProtectedRoute component={ClockPage} /></Route>
      <Route path="/register"><ProtectedRoute component={Register} permission="reports.view" /></Route>
      <Route path="/topup"><ProtectedRoute component={TopUp} permission="pos.sale" /></Route>
      <Route path="/price-manager"><ProtectedRoute component={PriceManager} permission="pricing.manage" /></Route>
      <Route path="/promotions"><ProtectedRoute component={Promotions} permission="pricing.manage" /></Route>
      <Route path="/supplier-returns"><ProtectedRoute component={SupplierReturns} permission="inventory.manage" /></Route>
      <Route path="/quotations"><ProtectedRoute component={Quotations} permission="orders.view" /></Route>
      <Route path="/layaway"><ProtectedRoute component={LayawayPage} permission="orders.view" /></Route>
      <Route path="/work-orders"><ProtectedRoute component={WorkOrdersPage} permission="orders.view" /></Route>
      <Route path="/work-orders/:id"><ProtectedRoute component={WorkOrderDetailPage} permission="orders.view" /></Route>
      <Route path="/messages"><ProtectedRoute component={MessagesPage} permission="orders.view" /></Route>
      <Route path="/wo/:id/:token" component={WorkOrderPortalPage} />
      <Route path="/packages"><ProtectedRoute component={PackagesPage} permission="orders.view" /></Route>
      <Route path="/gift-vouchers"><ProtectedRoute component={GiftVouchers} permission="vouchers.manage" /></Route>
      <Route path="/scale"><ProtectedRoute component={ScalePage} permission="scale.use" /></Route>
      <Route path="/store"><ProtectedRoute component={StorePage} /></Route>
      <Route path="/settings"><ProtectedRoute component={AdminSettings} permission="settings.view" /></Route>
      <Route path="/account"><ProtectedRoute component={Account} permission="settings.manage" /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} permission="settings.manage" /></Route>
      <Route path="/signup" component={Onboarding} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/admin-invite" component={AdminInvitePage} />
      <Route path="/superadmin" component={Superadmin} />
      <Route path="/technician/register" component={TechnicianRegister} />
      <Route path="/technician/login" component={TechnicianLogin} />
      <Route path="/technician" component={TechnicianPortal} />
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

// ── Kiosk Lockdown ─────────────────────────────────────────────────────────
// When the operator enters fullscreen, kiosk mode "arms". Any subsequent exit
// from fullscreen (ESC, F11, browser menu, even a page reload) shows a
// blocking PIN overlay that only a manager / admin / supervisor can dismiss.
// The armed flag is persisted in sessionStorage so a reload can't bypass it.
const KIOSK_ARMED_KEY = "nexxus_kiosk_armed";
// Set by openReceiptWindow() in receipt.ts just before window.print() is
// called and cleared when afterprint fires. When this flag is present, a
// fullscreen exit is caused by the print dialog — not an escape attempt —
// so KioskLock should stay armed but NOT show the PIN overlay.
const KIOSK_PRINTING_KEY = "nexxus_kiosk_printing";

function KioskLock() {
  const [locked, setLocked] = useState(false);
  const armedRef = useRef(false);

  useEffect(() => {
    if (!fsSupported) return;

    // If the kiosk was armed before a reload but we are no longer in
    // fullscreen, treat that as an unauthorized exit and lock immediately.
    const wasArmed = sessionStorage.getItem(KIOSK_ARMED_KEY) === "1";
    if (wasArmed && !document.fullscreenElement) {
      armedRef.current = true;
      setLocked(true);
    } else if (document.fullscreenElement) {
      armedRef.current = true;
      sessionStorage.setItem(KIOSK_ARMED_KEY, "1");
    }

    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      if (isFs) {
        // Entering fullscreen arms the kiosk.
        armedRef.current = true;
        sessionStorage.setItem(KIOSK_ARMED_KEY, "1");
      } else if (armedRef.current) {
        // Exiting fullscreen while armed — but if the print dialog caused the
        // exit, skip the PIN gate. The kiosk stays armed (armedRef stays true)
        // so the next real fullscreen exit is still caught.
        const isPrinting = sessionStorage.getItem(KIOSK_PRINTING_KEY) === "1";
        if (!isPrinting) {
          setLocked(true);
        }
      }
    };

    document.addEventListener("fullscreenchange", onFsChange);

    // Browsers do not allow JS to outright block window/tab close, but a
    // beforeunload handler that calls preventDefault() forces the browser
    // to show its native "Leave site?" confirmation. While the kiosk is
    // armed, any attempt to close the tab, reload, or navigate away gets
    // this confirmation — turning an instant close into a deliberate
    // action the cashier has to consciously confirm.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (sessionStorage.getItem(KIOSK_ARMED_KEY) === "1") {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const handleUnlock = () => {
    // PIN verified — disarm kiosk so the operator can use the terminal
    // outside fullscreen until they choose to re-enter kiosk mode.
    armedRef.current = false;
    sessionStorage.removeItem(KIOSK_ARMED_KEY);
    setLocked(false);
  };

  const handleReenterFullscreen = () => {
    document.documentElement.requestFullscreen().catch(() => {});
    // The fullscreenchange listener will keep armedRef = true.
    setLocked(false);
  };

  if (!locked) return null;

  return (
    <Dialog open={locked} onOpenChange={() => { /* not dismissable */ }}>
      <DialogContent
        className="sm:max-w-sm"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            🔒 Terminal Locked — Manager PIN Required
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground text-center -mt-1 mb-1">
          Fullscreen kiosk mode was exited. A manager, supervisor or admin PIN
          is required to unlock this terminal.
        </p>
        <PinPad
          title=""
          requiredRoles={["manager", "admin", "supervisor"]}
          onSuccess={handleUnlock}
        />
        <button
          type="button"
          onClick={handleReenterFullscreen}
          className="mt-2 w-full rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium py-2 transition-colors"
        >
          ⛶ Re-enter Fullscreen (no PIN required)
        </button>
      </DialogContent>
    </Dialog>
  );
}

// Gates all kiosk-lockdown behavior on the `kiosk_lock_enabled` tenant setting.
// Rendered under the query provider so it can read settings. When the setting
// is off (the default, while loading, or when no tenant is signed in) nothing
// arms, and any stale armed flag from a previous session is cleared so a
// terminal that was armed before the lock was disabled isn't stuck behind the
// PIN overlay.
function KioskActive() {
  useAutoFullscreen();
  return (
    <>
      <FullscreenFab />
      <KioskLock />
    </>
  );
}

function KioskController() {
  const { data: settings, isLoading } = useGetSettings();
  const enabled = settings?.kiosk_lock_enabled === "true";

  useEffect(() => {
    // Only clear stale armed state once settings have definitively loaded and
    // the lock is off. Clearing during the loading window (when `enabled` is
    // still false because data hasn't arrived) would let an enabled kiosk be
    // bypassed by reloading before settings resolve.
    if (!isLoading && !enabled) {
      try {
        sessionStorage.removeItem(KIOSK_ARMED_KEY);
        sessionStorage.removeItem(KIOSK_PRINTING_KEY);
      } catch {
        /* ignore storage errors */
      }
    }
  }, [isLoading, enabled]);

  if (!enabled) return null;
  return <KioskActive />;
}

function POSApp() {
  return (
    <ThemeProvider>
      <StaffProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
        >
          <TooltipProvider>
            <PosChromeProvider>
              <WouterRouter base="/app">
                <POSRouter />
              </WouterRouter>
              <Toaster />
              <OfflineBanner />
              <PWAUpdatePrompt />
              <KioskController />
            </PosChromeProvider>
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
