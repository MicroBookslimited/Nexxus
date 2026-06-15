import { useEffect, useState } from "react";
import {
  useGetShopifyConnection,
  useSaveShopifyConnection,
  useTestShopifyConnection,
  useUpdateShopifySyncSettings,
  useDisconnectShopify,
  getGetShopifyConnectionQueryKey,
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
  Eye, EyeOff, Plug, Unplug,
} from "lucide-react";

type LocationRow = { id: number; name: string };

const DEFAULT_API_VERSION = "2025-01";

export function ShopifyIntegrationCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: conn, isLoading } = useGetShopifyConnection();

  const saveMutation = useSaveShopifyConnection();
  const testMutation = useTestShopifyConnection();
  const syncMutation = useUpdateShopifySyncSettings();
  const disconnectMutation = useDisconnectShopify();

  type AuthMethod = "client_credentials" | "token";
  const [authMethod, setAuthMethod] = useState<AuthMethod>("client_credentials");
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [apiVersion, setApiVersion] = useState(DEFAULT_API_VERSION);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [locations, setLocations] = useState<LocationRow[]>([]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetShopifyConnectionQueryKey() });

  useEffect(() => {
    if (conn?.shopDomain) setShopDomain(conn.shopDomain);
    if (conn?.apiVersion) setApiVersion(conn.apiVersion);
    if (conn?.authMode === "token" || conn?.authMode === "client_credentials") {
      setAuthMethod(conn.authMode);
    }
    if (conn?.clientId) setClientId(conn.clientId);
  }, [conn?.shopDomain, conn?.apiVersion, conn?.authMode, conn?.clientId]);

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    fetch("/api/locations", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: LocationRow[]) => setLocations(Array.isArray(rows) ? rows : []))
      .catch(() => setLocations([]));
  }, []);

  const hasToken = !!conn?.hasToken;
  const connected = !!conn?.connected;

  async function handleSave(thenTest: boolean) {
    if (!shopDomain.trim()) {
      toast({ title: "Missing details", description: "Enter your store domain.", variant: "destructive" });
      return;
    }

    const base = { shopDomain: shopDomain.trim(), apiVersion: apiVersion.trim() || DEFAULT_API_VERSION };
    let data: typeof base & { accessToken?: string; clientId?: string; clientSecret?: string };

    if (authMethod === "client_credentials") {
      // Re-test without re-entering the secret is only valid when the SAVED
      // connection is already client-credentials (not a legacy token swap).
      const savedClientCreds = conn?.authMode === "client_credentials" && hasToken;
      if (!clientId.trim() || (!clientSecret.trim() && !savedClientCreds)) {
        toast({ title: "Missing details", description: "Enter your Client ID and Client Secret.", variant: "destructive" });
        return;
      }
      if (!clientSecret.trim()) {
        // No new secret entered. The save contract requires the secret, so if
        // non-secret fields were edited we must ask for it rather than silently
        // dropping those edits; otherwise just (re)test the existing connection.
        const domainChanged = shopDomain.trim() !== (conn?.shopDomain ?? "");
        const versionChanged =
          (apiVersion.trim() || DEFAULT_API_VERSION) !== (conn?.apiVersion ?? DEFAULT_API_VERSION);
        if (domainChanged || versionChanged) {
          toast({
            title: "Re-enter Client Secret",
            description: "Enter your Client Secret again to apply the updated details.",
            variant: "destructive",
          });
          return;
        }
        if (thenTest) await handleTest();
        return;
      }
      data = { ...base, clientId: clientId.trim(), clientSecret: clientSecret.trim() };
    } else {
      if (!accessToken.trim()) {
        toast({ title: "Missing details", description: "Enter your Admin API access token.", variant: "destructive" });
        return;
      }
      data = { ...base, accessToken: accessToken.trim() };
    }

    try {
      await saveMutation.mutateAsync({ data });
      setAccessToken("");
      setClientSecret("");
      await invalidate();
      if (thenTest) await handleTest();
      else toast({ title: "Saved", description: "Shopify credentials saved. Test the connection to activate." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save Shopify credentials.";
      toast({ title: "Could not save", description: message, variant: "destructive" });
    }
  }

  async function handleTest() {
    try {
      const res = await testMutation.mutateAsync();
      await invalidate();
      if (res.ok && res.shop) {
        toast({ title: "Connected", description: `Connected to ${res.shop.name}.` });
      } else {
        toast({ title: "Connection failed", description: res.error ?? "Shopify rejected the credentials.", variant: "destructive" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed.";
      await invalidate();
      toast({ title: "Connection failed", description: message, variant: "destructive" });
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectMutation.mutateAsync();
      setAccessToken("");
      setClientSecret("");
      setClientId("");
      await invalidate();
      toast({ title: "Disconnected", description: "Shopify has been disconnected." });
    } catch {
      toast({ title: "Error", description: "Failed to disconnect Shopify.", variant: "destructive" });
    }
  }

  async function patchSync(patch: Partial<ShopifyConnectionStatus> & { defaultLocationId?: number | null }) {
    try {
      await syncMutation.mutateAsync({ data: patch as never });
      await invalidate();
    } catch {
      toast({ title: "Error", description: "Failed to update sync settings.", variant: "destructive" });
    }
  }

  const statusBadge = () => {
    if (connected) {
      return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> Connected</Badge>;
    }
    if (conn?.status === "failed") {
      return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>;
    }
    return <Badge variant="secondary" className="gap-1">Not connected</Badge>;
  };

  return (
    <Card id="section-integrations">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-primary" />
          Shopify
          <span className="ml-auto">{statusBadge()}</span>
        </CardTitle>
        <CardDescription>
          Connect your Shopify store with your app's Client ID &amp; Secret (or a legacy Admin API token).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {connected && conn?.shopName && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">Connected store: </span>
                <span className="font-medium">{conn.shopName}</span>
                <span className="text-muted-foreground"> ({conn.shopDomain})</span>
              </div>
            )}
            {conn?.status === "failed" && conn?.lastTestMessage && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-sm text-red-600">
                {conn.lastTestMessage}
              </div>
            )}

            {/* ── Credentials ── */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="shopify-domain">Store domain</Label>
                <Input
                  id="shopify-domain"
                  placeholder="my-store.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="shopify-method">Connection method</Label>
                <Select
                  value={authMethod}
                  onValueChange={(v) => {
                    setAuthMethod(v as AuthMethod);
                    // Drop any half-entered secret material when switching methods.
                    setClientSecret("");
                    setAccessToken("");
                  }}
                >
                  <SelectTrigger id="shopify-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_credentials">Client ID &amp; Secret (recommended)</SelectItem>
                    <SelectItem value="token">Access token (legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authMethod === "client_credentials" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="shopify-client-id">Client ID</Label>
                    <Input
                      id="shopify-client-id"
                      placeholder="e.g. a1b2c3d4e5f6…"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="shopify-client-secret">Client Secret</Label>
                    <div className="relative">
                      <Input
                        id="shopify-client-secret"
                        type={showSecret ? "text" : "password"}
                        placeholder={hasToken ? "•••••••• (saved — enter a new secret to replace)" : "shpss_…"}
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showSecret ? "Hide secret" : "Show secret"}
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Stored encrypted. We exchange these for a short-lived token and refresh it automatically.
                    </p>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="shopify-token">Admin API access token</Label>
                  <div className="relative">
                    <Input
                      id="shopify-token"
                      type={showToken ? "text" : "password"}
                      placeholder={hasToken ? "•••••••• (saved — enter a new token to replace)" : "shpat_…"}
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showToken ? "Hide token" : "Show token"}
                    >
                      {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Stored encrypted. We never display it again after saving.
                  </p>
                </div>
              )}

              <div className="space-y-1.5 max-w-[200px]">
                <Label htmlFor="shopify-version">API version</Label>
                <Input
                  id="shopify-version"
                  placeholder={DEFAULT_API_VERSION}
                  value={apiVersion}
                  onChange={(e) => setApiVersion(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => handleSave(true)}
                disabled={saveMutation.isPending || testMutation.isPending}
                className="gap-1.5"
              >
                {(saveMutation.isPending || testMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                {hasToken ? "Update & Test" : "Connect & Test"}
              </Button>
              {hasToken && (
                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testMutation.isPending}
                  className="gap-1.5"
                >
                  {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Test connection
                </Button>
              )}
              {hasToken && (
                <Button
                  variant="ghost"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                  Disconnect
                </Button>
              )}
            </div>

            {/* ── Sync settings (only once connected) ── */}
            {connected && (
              <div className="space-y-4 pt-2 border-t border-border">
                <p className="text-sm font-medium">Sync settings</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {([
                    ["syncProducts", "Products"],
                    ["syncInventory", "Inventory"],
                    ["syncOrders", "Orders"],
                    ["syncCustomers", "Customers"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      <span className="text-sm">{label}</span>
                      <Switch
                        checked={!!conn?.[key]}
                        onCheckedChange={(v) => patchSync({ [key]: v } as Partial<ShopifyConnectionStatus>)}
                        disabled={syncMutation.isPending}
                      />
                    </label>
                  ))}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Sync direction</Label>
                    <Select
                      value={conn?.syncDirection ?? "shopify_to_nexus"}
                      onValueChange={(v) => patchSync({ syncDirection: v })}
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
                    <Label>Default location</Label>
                    <Select
                      value={conn?.defaultLocationId != null ? String(conn.defaultLocationId) : "none"}
                      onValueChange={(v) => patchSync({ defaultLocationId: v === "none" ? null : Number(v) })}
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
                </div>
              </div>
            )}

            {/* ── Setup instructions ── */}
            <div className="pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowInstructions((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {showInstructions ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {authMethod === "client_credentials" ? "How to get your Client ID & Secret" : "How to create a custom-app token"}
              </button>
              {showInstructions && authMethod === "client_credentials" && (
                <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
                  <li>Go to the <span className="font-medium">Shopify Dev Dashboard</span> (<code>shopify.dev/dashboard</code>) and open <span className="font-medium">Apps → Create app</span> (or select an existing app).</li>
                  <li>Under <span className="font-medium">API access / Configuration</span>, grant the scopes you need (products, inventory, orders, customers).</li>
                  <li>Install the app on your store, then open the app's <span className="font-medium">Client credentials</span> and copy the <span className="font-medium">Client ID</span> and <span className="font-medium">Client secret</span> (starts with <code>shpss_</code>).</li>
                  <li>Paste your store domain, Client ID and Client Secret above, then click <span className="font-medium">Connect &amp; Test</span>.</li>
                  <li className="text-xs">Since Jan 1, 2026 Shopify no longer issues static <code>shpat_</code> tokens — we exchange these credentials for a short-lived token and refresh it for you.</li>
                </ol>
              )}
              {showInstructions && authMethod === "token" && (
                <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
                  <li>In Shopify admin, go to <span className="font-medium">Settings → Apps and sales channels → Develop apps</span>.</li>
                  <li>Click <span className="font-medium">Create an app</span> and name it (e.g. "NEXXUS POS").</li>
                  <li>Open <span className="font-medium">Configuration → Admin API integration</span> and grant the scopes you need (products, inventory, orders, customers).</li>
                  <li>Click <span className="font-medium">Install app</span>, then reveal and copy the <span className="font-medium">Admin API access token</span> (starts with <code>shpat_</code>).</li>
                  <li>Paste your store domain and the token above, then click <span className="font-medium">Connect &amp; Test</span>.</li>
                  <li className="text-xs">Note: apps created after Jan 1, 2026 can no longer issue static tokens — use the Client ID &amp; Secret method instead.</li>
                </ol>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
