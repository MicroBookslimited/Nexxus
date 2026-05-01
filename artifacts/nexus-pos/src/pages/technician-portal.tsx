import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { LogOut, Wrench, Building2, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  technicianMe, technicianListTenants, technicianLoginAs,
  TECHNICIAN_TOKEN_KEY, TENANT_TOKEN_KEY,
  type Technician, type TechnicianAssignedTenant,
} from "@/lib/saas-api";
import { clearQueryCache } from "@/lib/query-persister";
import { storeImpersonationMeta } from "@/components/ImpersonationBanner";

export function TechnicianPortal() {
  const [, setLocation] = useLocation();
  const [me, setMe] = useState<Technician | null>(null);
  const [tenants, setTenants] = useState<TechnicianAssignedTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(TECHNICIAN_TOKEN_KEY);
    if (!token) { setLocation("/technician/login"); return; }

    Promise.all([technicianMe(), technicianListTenants()])
      .then(([m, t]) => {
        setMe(m.technician);
        setTenants(t);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not load your account";
        setError(msg);
        localStorage.removeItem(TECHNICIAN_TOKEN_KEY);
        setTimeout(() => setLocation("/technician/login"), 2000);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSignOut() {
    localStorage.removeItem(TECHNICIAN_TOKEN_KEY);
    localStorage.removeItem(TENANT_TOKEN_KEY);
    clearQueryCache();
    setLocation("/technician/login");
  }

  async function openPos(tenantId: number, businessName: string) {
    setOpeningId(tenantId);
    setError("");
    try {
      const { token, impersonationLogId } = await technicianLoginAs(tenantId);
      clearQueryCache();
      localStorage.setItem(TENANT_TOKEN_KEY, token);
      storeImpersonationMeta(businessName, impersonationLogId);
      setLocation("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not open POS");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">Technician Portal</h1>
              {me && <p className="text-xs text-muted-foreground">{me.name} • {me.email}</p>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">Assigned customers</h2>
              <p className="text-sm text-muted-foreground">
                Select a customer to access their POS for setup, inventory, hardware and reporting.
                Sales and financial actions are disabled.
              </p>
            </div>

            {tenants.length === 0 ? (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="p-8 text-center">
                  <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    You haven't been assigned to any customers yet. NEXXUS POS staff will assign you to customers as needed.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {tenants.map(t => (
                  <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-border/50 bg-card/50 hover:border-primary/40 transition-colors">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold truncate">{t.businessName}</h3>
                            <p className="text-xs text-muted-foreground truncate">{t.email}</p>
                            {t.country && <p className="text-xs text-muted-foreground mt-0.5">{t.country}</p>}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "active" ? "bg-green-500/15 text-green-500" : "bg-muted text-muted-foreground"}`}>
                            {t.status}
                          </span>
                        </div>
                        <Button
                          className="w-full"
                          onClick={() => openPos(t.id, t.businessName)}
                          disabled={openingId === t.id}
                        >
                          {openingId === t.id ? "Opening…" : (<>Open POS<ArrowRight className="ml-2 h-4 w-4" /></>)}
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
