import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import {
  BookOpen, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronRight,
  Plug, Unplug, RefreshCw, Building2,
} from "lucide-react";

/* ─── types mirrored from /api/zoho ─── */

type ZohoConnection = {
  id: number;
  connected: boolean;
  hasToken: boolean;
  region: string;
  organizationId: string | null;
  organizationName: string | null;
  organizationCurrency: string | null;
  status: string;
  isActive: boolean;
  syncCustomers: boolean;
  syncDirection: "zoho_to_nexus" | "nexus_to_zoho" | "two_way";
  autoSync: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestMessage: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  connectedAt: string | null;
  syncRunning: boolean;
};

type ZohoStatus = {
  configured: boolean;
  redirectUri: string;
  regions: Array<{ value: string; label: string }>;
  connection: ZohoConnection | null;
};

type ZohoOrganization = {
  organizationId: string;
  name: string;
  currencyCode: string;
  isDefault: boolean;
};

type ZohoSyncLog = {
  id: number;
  syncType: string;
  direction: string | null;
  status: string;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsFailed: number;
  message: string | null;
  createdAt: string;
};

type SyncSummary = {
  status: string;
  created: number;
  updated: number;
  failed: number;
  conflicts: number;
  remaining: number;
  message: string;
};

/* ─── tiny fetch helper (these endpoints are outside the generated client) ─── */

async function zohoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  const res = await fetch(`/api/zoho${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
  }
  return data as T;
}

const DIRECTION_LABELS: Record<ZohoConnection["syncDirection"], string> = {
  two_way: "Two-way — keep both in step",
  nexus_to_zoho: "NEXXUS → Zoho Books only",
  zoho_to_nexus: "Zoho Books → NEXXUS only",
};

function formatWhen(value: string | null): string {
  if (!value) return "never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "never";
  return d.toLocaleString();
}

export function ZohoIntegrationCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [region, setRegion] = useState("com");
  const [showInstructions, setShowInstructions] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const statusQuery = useQuery<ZohoStatus>({
    queryKey: ["/api/zoho/connection"],
    queryFn: () => zohoApi<ZohoStatus>("/connection"),
  });
  const status = statusQuery.data;
  const conn = status?.connection ?? null;
  const isConnected = !!conn?.connected;

  const orgsQuery = useQuery<ZohoOrganization[]>({
    queryKey: ["/api/zoho/organizations"],
    queryFn: () => zohoApi<ZohoOrganization[]>("/organizations"),
    enabled: isConnected,
    retry: false,
  });

  const logsQuery = useQuery<ZohoSyncLog[]>({
    queryKey: ["/api/zoho/sync/logs"],
    queryFn: () => zohoApi<ZohoSyncLog[]>("/sync/logs"),
    enabled: isConnected,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/zoho/connection"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/zoho/sync/logs"] });
  };

  useEffect(() => {
    if (conn?.region) setRegion(conn.region);
  }, [conn?.region]);

  // Surface the OAuth callback result (?zoho=connected|error) as a toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("zoho");
    if (!result) return;
    if (result === "connected") {
      const org = params.get("org");
      toast({
        title: "Zoho Books connected",
        description: org ? `Connected to ${org}.` : "Now choose your organisation below.",
      });
      invalidate();
    } else if (result === "error") {
      toast({
        title: "Could not connect",
        description: params.get("message") ?? "Zoho authorization failed.",
        variant: "destructive",
      });
    }
    params.delete("zoho");
    params.delete("org");
    params.delete("message");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}#section-integrations`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      zohoApi<ZohoConnection>("/connection", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  async function handleConnect() {
    setBusy("connect");
    try {
      const res = await zohoApi<{ authorizeUrl: string }>("/oauth/start", {
        method: "POST",
        body: JSON.stringify({ region }),
      });
      window.location.href = res.authorizeUrl;
    } catch (err) {
      toast({
        title: "Could not connect",
        description: err instanceof Error ? err.message : "Failed to start the Zoho connection.",
        variant: "destructive",
      });
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    try {
      const res = await zohoApi<{ ok: boolean; message: string }>("/test", { method: "POST" });
      toast({
        title: res.ok ? "Connection is working" : "Connection problem",
        description: res.message,
        ...(res.ok ? {} : { variant: "destructive" as const }),
      });
      invalidate();
    } catch (err) {
      toast({
        title: "Connection problem",
        description: err instanceof Error ? err.message : "Could not reach Zoho Books.",
        variant: "destructive",
      });
      invalidate();
    } finally {
      setBusy(null);
    }
  }

  async function handleSyncNow() {
    setBusy("sync");
    try {
      const res = await zohoApi<SyncSummary>("/sync/customers", { method: "POST" });
      toast({
        title: res.status === "error" ? "Sync failed" : "Sync finished",
        description: res.message || "Nothing to do — everything was already up to date.",
        ...(res.status === "error" ? { variant: "destructive" as const } : {}),
      });
      invalidate();
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Zoho customer sync failed.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect Zoho Books? Customers already synced stay in both systems.")) {
      return;
    }
    setBusy("disconnect");
    try {
      await zohoApi("/connection", { method: "DELETE" });
      toast({ title: "Disconnected", description: "NEXXUS no longer syncs with Zoho Books." });
      invalidate();
    } catch (err) {
      toast({
        title: "Could not disconnect",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  const regions = status?.regions ?? [{ value: "com", label: "United States (zoho.com)" }];

  return (
    <Card data-testid="card-zoho-integration">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Zoho Books</CardTitle>
              <CardDescription>
                Keep your POS customers and your Zoho Books contacts in step — no re-typing at
                invoice time.
              </CardDescription>
            </div>
          </div>
          {isConnected ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {statusQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !status?.configured ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Zoho isn't set up on this server yet. The NEXXUS administrator needs to add the Zoho
              Client ID and Secret before businesses can connect their books.
            </div>
          </div>
        ) : !isConnected ? (
          <>
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="zoho-region">Where is your Zoho account hosted?</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="zoho-region" className="h-9" data-testid="select-zoho-region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                It's the address you use to sign in to Zoho — most accounts are zoho.com.
              </p>
            </div>

            <Button onClick={handleConnect} disabled={busy === "connect"} data-testid="button-zoho-connect">
              {busy === "connect" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              Connect Zoho Books
            </Button>

            <button
              type="button"
              onClick={() => setShowInstructions((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {showInstructions ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              What happens when I connect?
            </button>
            {showInstructions && (
              <div className="rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                You'll be taken to Zoho to sign in and approve access. NEXXUS only asks for
                permission to read and write <strong>contacts</strong> in Zoho Books — it can't touch
                your invoices, bills or banking. Nothing is copied until you pick an organisation and
                run the first sync, and you can disconnect at any time.
              </div>
            )}
          </>
        ) : (
          <>
            {/* Organisation */}
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="zoho-org">Zoho Books organisation</Label>
              <Select
                value={conn?.organizationId ?? ""}
                onValueChange={(v) => patchMutation.mutate({ organizationId: v })}
                disabled={orgsQuery.isLoading || patchMutation.isPending}
              >
                <SelectTrigger id="zoho-org" className="h-9" data-testid="select-zoho-org">
                  <SelectValue placeholder={orgsQuery.isLoading ? "Loading…" : "Choose an organisation"} />
                </SelectTrigger>
                <SelectContent>
                  {(orgsQuery.data ?? []).map((o) => (
                    <SelectItem key={o.organizationId} value={o.organizationId}>
                      {o.name || o.organizationId}
                      {o.currencyCode ? ` · ${o.currencyCode}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!conn?.organizationId && (
                <p className="flex items-center gap-1 text-xs text-amber-700">
                  <AlertCircle className="h-3 w-3" /> Choose your organisation before syncing.
                </p>
              )}
              {orgsQuery.isError && (
                <p className="text-xs text-destructive">
                  Could not load organisations — try Test connection.
                </p>
              )}
            </div>

            {/* Sync settings */}
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="zoho-sync-customers" className="text-sm">
                    Sync customers
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Match on email, then phone, then name — existing contacts are reused, not
                    duplicated.
                  </p>
                </div>
                <Switch
                  id="zoho-sync-customers"
                  checked={!!conn?.syncCustomers}
                  onCheckedChange={(checked) => patchMutation.mutate({ syncCustomers: checked })}
                  data-testid="switch-zoho-sync-customers"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="zoho-direction" className="text-sm">
                  Direction
                </Label>
                <Select
                  value={conn?.syncDirection ?? "two_way"}
                  onValueChange={(v) => patchMutation.mutate({ syncDirection: v })}
                >
                  <SelectTrigger id="zoho-direction" className="h-9" data-testid="select-zoho-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DIRECTION_LABELS) as Array<ZohoConnection["syncDirection"]>).map(
                      (key) => (
                        <SelectItem key={key} value={key}>
                          {DIRECTION_LABELS[key]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                {conn?.syncDirection === "two_way" && (
                  <p className="text-xs text-muted-foreground">
                    If the same customer was edited on both sides, the NEXXUS version wins.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label htmlFor="zoho-auto-sync" className="text-sm">
                    Send changes straight away
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    New or edited customers go to Zoho Books as soon as they're saved.
                  </p>
                </div>
                <Switch
                  id="zoho-auto-sync"
                  checked={!!conn?.autoSync}
                  onCheckedChange={(checked) => patchMutation.mutate({ autoSync: checked })}
                  data-testid="switch-zoho-auto-sync"
                />
              </div>
            </div>

            {/* Last sync */}
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {conn?.organizationName ?? "No organisation chosen"}
                {conn?.organizationCurrency ? ` · ${conn.organizationCurrency}` : ""}
              </div>
              <div className="mt-1">
                Last sync: {formatWhen(conn?.lastSyncAt ?? null)}
                {conn?.lastSyncMessage ? ` — ${conn.lastSyncMessage}` : ""}
              </div>
              {conn?.lastTestMessage && <div className="mt-1">Last check: {conn.lastTestMessage}</div>}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSyncNow}
                disabled={busy !== null || !conn?.organizationId || !conn?.syncCustomers}
                data-testid="button-zoho-sync-now"
              >
                {busy === "sync" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync customers now
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={busy !== null} data-testid="button-zoho-test">
                {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Test connection
              </Button>
              <Button
                variant="ghost"
                onClick={handleDisconnect}
                disabled={busy !== null}
                className="text-destructive hover:text-destructive"
                data-testid="button-zoho-disconnect"
              >
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>

            {/* Recent activity */}
            {(logsQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Recent activity
                </Label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {logsQuery.data!.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 text-xs">
                      {log.status === "error" ? (
                        <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                      )}
                      <span className="text-muted-foreground">
                        {formatWhen(log.createdAt)} — {log.message ?? log.syncType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
