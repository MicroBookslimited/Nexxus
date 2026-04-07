import { useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { Layout } from "@/components/layout";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  // Simplistic auth check: any user not on login could be considered authed, 
  // but realistically we'll just wrap protected pages in the layout.
  return (
    <Layout>
      <Component />
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
      <Route path="/pos"><ProtectedRoute component={POS} /></Route>
      <Route path="/orders"><ProtectedRoute component={Orders} /></Route>
      <Route path="/products"><ProtectedRoute component={Products} /></Route>
      <Route path="/customers"><ProtectedRoute component={Customers} /></Route>
      <Route path="/reports"><ProtectedRoute component={Reports} /></Route>
      <Route path="/tables"><ProtectedRoute component={Tables} /></Route>
      <Route path="/kitchen"><ProtectedRoute component={Kitchen} /></Route>
      <Route path="/staff"><ProtectedRoute component={Staff} /></Route>
      <Route path="/locations"><ProtectedRoute component={Locations} /></Route>
      <Route path="/cash"><ProtectedRoute component={CashManagement} /></Route>
      <Route path="/settings"><ProtectedRoute component={AdminSettings} /></Route>
      <Route path="/subscription"><ProtectedRoute component={SubscriptionPage} /></Route>
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

  // Force dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
        <FullscreenFab />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
