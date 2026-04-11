import { Router, Switch, Route, Redirect, useLocation } from "wouter";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import DashboardPage from "@/pages/DashboardPage";
import ReferralsPage from "@/pages/ReferralsPage";
import CommissionsPage from "@/pages/CommissionsPage";
import PayoutsPage from "@/pages/PayoutsPage";
import ProfilePage from "@/pages/ProfilePage";
import { Loader2 } from "lucide-react";

function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function PrivateRoutes() {
  const { reseller, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!reseller) return <Redirect to="/login" />;

  return (
    <Layout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/referrals" component={ReferralsPage} />
        <Route path="/commissions" component={CommissionsPage} />
        <Route path="/payouts" component={PayoutsPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route><Redirect to="/dashboard" /></Route>
      </Switch>
    </Layout>
  );
}

function PublicPage({ children }: { children: React.ReactNode }) {
  const { reseller, loading } = useAuth();
  if (loading) return <Spinner />;
  if (reseller) return <Redirect to="/dashboard" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login">
        <PublicPage><LoginPage /></PublicPage>
      </Route>
      <Route path="/signup">
        <PublicPage><SignupPage /></PublicPage>
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route>
        <PrivateRoutes />
      </Route>
    </Switch>
  );
}

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <Router base={base}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
