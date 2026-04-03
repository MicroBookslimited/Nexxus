import { useEffect } from "react";
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
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
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
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
