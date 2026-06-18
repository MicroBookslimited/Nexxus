import { useEffect, useState } from "react";
import {
  useListShopifyConnections,
  useStartShopifyOAuth,
  useTestShopifyConnection,
  useUpdateShopifySyncSettings,
  useDisconnectShopify,
  getListShopifyConnectionsQueryKey,
  type ShopifyConnectionStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import {
  ShoppingBag, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Plug, Unplug, Store,
} from "lucide-react";

type LocationRow = { id: number; name: string };

/** Controlled input that only fires onCommit on blur/Enter to avoid per-keystroke PATCH calls. */
function ApiVersionInput({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const commit = () => onCommit(draft.trim());
  return (
    <Input
      id={id}
      placeholder="e.g. 2025-01"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
      className="h-9 text-sm"
    />
  );
}

export function ShopifyIntegrationCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: connections, isLoading } = useListShopifyConnections();

  const startMutation = useStartShopifyOAuth();
  const testMutation = useTestShopifyConnection();
  const syncMutation = useUpdateShopifySyncSettings();
  const disconnectMutation = useDisconnectShopify();

  const [shopDomain, setShopDomain] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListShopifyConnectionsQueryKey() });

  // Load locations (for the per-store default-location picker).
  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    fetch("/api/locations", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LocationRow[]) => setLocations(Array.isArray(rows) ? rows : []))
      .catch(() => setLocations([]));
  }, []);

  // Surface the OAuth callback result (?shopify=connected|error) as a toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("shopify");
    if (!status) return;
    if (status === "connected") {
      const shop = params.get("shop");
      toast({
        title: "Store connected",
        description: shop ? `Connected to ${shop}.` : "Shopify store connected.",
      });
      void invalidate();
    } else if (status === "error") {
      toast({
        title: "Could not connect",
        description: params.get("message") ?? "Shopify authorization failed.",
        variant: "destructive",
      });
    }
    // Strip the shopify params but keep the integrations anchor.
    params.delete("shopify");
    params.delete("shop");
    params.delete("message");
    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}#section-integrations`;
    window.history.replaceState(null, "", newUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    const domain = shopDomain.trim();
    if (!domain) {
      toast({ title: "Missing store domain", description: "Enter your store domain to connect.", variant: "destructive" });
      return;
    }
    try {
      const res = await startMutation.mutateAsync({ data: { shopDomain: domain } });
      // Redirect the browser to Shopify's consent screen.
      window.location.href = res.authorizeUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start Shopify connection.";
      toast({ title: "Could not connect", description: message, variant: "destructive" });
    }
  }

  async function handleTest(id: number) {
    setBusyId(id);
    try {
      const res = await testMutation.mutateAsync({ id });
      await invalidate();
      if (res.ok && res.shop) {
        toast({ title: "Connected", description: `Connected to ${res.shop.name}.` });
      } else {
        toast({ title: "Connection failed", description: res.error ?? "Shopify rejected the token.", variant: "destructive" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed.";
      await invalidate();
      toast({ title: "Connection failed", description: message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisconnect(id: number) {
    setBusyId(id);
    try {
      await disconnectMutation.mutateAsync({ id });
      await invalidate();
      toast({ title: "Disconnected", description: "Shopify store has been disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Shopify store.", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function patchSync(id: number, patch: Partial<ShopifyConnectionStatus> & { defaultLocationId?: number | null }) {
    try {
      await syncMutation.mutateAsync({ id, data: patch as never });
      await invalidate();
    } catch {
      toast({ title: "Error", description: "Failed to update sync settings.", variant: "destructive" });
    }
  }

  const stores = connections ?? [];

  const statusBadge = (conn: ShopifyConnectionStatus) => {
    if (conn.connected) {
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
    }
    if (conn.status === "failed") {
      return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
    }
    return <Badge variant="secondary" className="gap-1">Inactive</Badge>;
  };

  return (
    <Card id="section-integrations">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Shopify
          {stores.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{stores.length} store{stores.length === 1 ? "" : "s"}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Connect one or more Shopify stores. We redirect you to Shopify to authorize access — no tokens to copy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* ── Connected stores ── */}
            {stores.length > 0 && (
              <div className="space-y-4">
                {stores.map((conn) => {
                  const id = conn.id as number;
                  const busy = busyId === id;
                  return (
                    <div key={id} className="rounded-lg border border-border p-3 space-y-4">
                      <div className="flex items-start gap-2">
                        <Store className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {conn.shopName ?? conn.shopDomain}
                          </div>
                          {conn.shopName && (
                            <div className="text-xs text-muted-foreground truncate">{conn.shopDomain}</div>
                          )}
                        </div>
                        {statusBadge(conn)}
                      </div>

                      {conn.status === "failed" && conn.lastTestMessage && (
                        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-2 text-xs text-red-600">
                          {conn.lastTestMessage}
                        </div>
                      )}

                      {/* Sync settings */}
                      <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-2">
                          {([
                            ["syncProducts", "Products"],
                            ["syncInventory", "Inventory"],
                            ["syncOrders", "Orders"],
                            ["syncCustomers", "Customers"],
                          ] as const).map(([key, label]) => (
                            <label key={key} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
                              <span className="text-sm">{label}</span>
                              <Switch
                                checked={!!conn[key]}
                                onCheckedChange={(v) => patchSync(id, { [key]: v } as Partial<ShopifyConnectionStatus>)}
                                disabled={syncMutation.isPending}
                              />
                            </label>
                          ))}
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Sync direction</Label>
                            <Select
                              value={conn.syncDirection ?? "shopify_to_nexus"}
                              onValueChange={(v) => patchSync(id, { syncDirection: v })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="shopify_to_nexus">Shopify → NEXXUS</SelectItem>
                                <SelectItem value="nexus_to_shopify">NEXXUS → Shopify</SelectItem>
                                <SelectItem value="two_way">Two-way</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Default location</Label>
                            <Select
                              value={conn.defaultLocationId != null ? String(conn.defaultLocationId) : "none"}
                              onValueChange={(v) => patchSync(id, { defaultLocationId: v === "none" ? null : Number(v) })}
                            >
                              <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {locations.map((loc) => (
                                  <SelectItem key={loc.id} value={String(loc.id)}>{loc.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`shopify-api-ver-${id}`} className="text-xs">Admin API version</Label>
                            <ApiVersionInput
                              id={`shopify-api-ver-${id}`}
                              value={conn.apiVersion ?? ""}
                              onCommit={(v) => patchSync(id, { apiVersion: v || undefined })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(id)}
                          disabled={busy}
                          className="gap-1.5"
                        >
                          {busy && testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDisconnect(id)}
                          disabled={busy}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          {busy && disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Connect a (new) store ── */}
            <div className="space-y-3 pt-1 border-t border-border">
              <p className="text-sm font-medium pt-3">
                {stores.length > 0 ? "Connect another store" : "Connect your Shopify store"}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="shopify-domain">Store domain</Label>
                  <Input
                    id="shopify-domain"
                    placeholder="my-store.myshopify.com"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleConnect(); }}
                  />
                </div>
                <Button onClick={handleConnect} disabled={startMutation.isPending} className="gap-1.5">
                  {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                  Connect store
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You'll be redirected to Shopify to approve access, then brought back here automatically.
              </p>
            </div>

            {/* ── Setup instructions ── */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowInstructions((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showInstructions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                How connecting works
              </button>
              {showInstructions && (
                <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
                  <li>Enter your store domain (e.g. <code>my-store.myshopify.com</code>) and click <span className="font-medium">Connect store</span>.</li>
                  <li>Shopify shows you exactly which permissions NEXXUS is requesting — click <span className="font-medium">Install</span> / <span className="font-medium">Approve</span>.</li>
                  <li>You're redirected back here and the store appears above as <span className="font-medium">Connected</span>.</li>
                  <li>Repeat for any additional stores — you can connect stores across different Shopify accounts.</li>
                  <li className="text-xs">Access is granted via a secure, long-lived token stored encrypted on our side. You never copy or paste any token.</li>
                </ol>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
