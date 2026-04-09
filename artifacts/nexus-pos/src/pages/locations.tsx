import { useState, useEffect, useCallback } from "react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  MapPin, Plus, Edit2, Package, ArrowLeftRight, Trash2,
  Building2, Phone, User, ChevronRight, RefreshCw, Boxes,
} from "lucide-react";
import { format } from "date-fns";

/* ─── Types ─── */
interface Location {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

interface InventoryItem {
  id: number;
  locationId: number;
  productId: number;
  stockCount: number;
  updatedAt: string;
  productName: string | null;
  productCategory: string | null;
  productPrice: number | null;
  productBarcode: string | null;
}

interface StockTransfer {
  id: number;
  fromLocationId: number | null;
  toLocationId: number | null;
  productId: number;
  quantity: number;
  notes: string | null;
  createdAt: string;
  productName: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
}

interface Product {
  id: number;
  name: string;
  stockCount: number | null;
  category: string | null;
}

/* ─── API helpers ─── */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, { headers: authHeaders(), ...options });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string };
    throw new Error(err.error ?? resp.statusText);
  }
  return resp.json() as Promise<T>;
}

/* ─── Location Form Modal ─── */
function LocationModal({ loc, onClose, onSaved }: { loc?: Location; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: loc?.name ?? "", address: loc?.address ?? "", phone: loc?.phone ?? "", isActive: loc?.isActive ?? true });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (loc) {
        await api(`/locations/${loc.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast({ title: "Location updated" });
      } else {
        await api(`/locations`, { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Location created" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{loc ? "Edit Location" : "New Location"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Branch Name *</Label>
            <Input placeholder="e.g. Downtown Branch" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input placeholder="Street, City" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input placeholder="Phone number" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          {loc && (
            <div className="flex items-center gap-3">
              <Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} />
              <Label>Active</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Inventory Manager ─── */
function InventoryPanel({ loc, products }: { loc: Location; products: Product[] }) {
  const { toast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [initializing, setInitializing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<InventoryItem[]>(`/locations/${loc.id}/inventory`);
      setInventory(data);
    } catch {
      setInventory([]);
    } finally {
      setLoading(false);
    }
  }, [loc.id]);

  useEffect(() => { load(); }, [load]);

  async function initInventory() {
    setInitializing(true);
    try {
      const res = await api<{ initialized: number; skipped: number }>(`/locations/${loc.id}/inventory/init`, { method: "POST" });
      toast({ title: `Initialized ${res.initialized} products (${res.skipped} already existed)` });
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInitializing(false);
    }
  }

  async function saveStock(productId: number, stockCount: number) {
    try {
      await api(`/locations/${loc.id}/inventory/${productId}`, { method: "PUT", body: JSON.stringify({ stockCount }) });
      toast({ title: "Stock updated" });
      setEditId(null);
      await load();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const filtered = inventory.filter(i => i.productName?.toLowerCase().includes(search.toLowerCase()) ?? true);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-sm" />
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs shrink-0" onClick={initializing ? undefined : initInventory} disabled={initializing}>
          <RefreshCw className={cn("h-3 w-3", initializing && "animate-spin")} />
          Init All Products
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading inventory…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <Boxes className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No inventory records. Click "Init All Products" to populate.</p>
        </div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {filtered.map(item => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/40 hover:border-border/70 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.productName}</p>
                <p className="text-xs text-muted-foreground">{item.productCategory ?? "—"}</p>
              </div>
              {editId === item.productId ? (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    className="w-20 h-7 text-xs"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") saveStock(item.productId, parseInt(editVal, 10));
                      if (e.key === "Escape") setEditId(null);
                    }}
                  />
                  <Button size="sm" className="h-7 text-xs px-2" onClick={() => saveStock(item.productId, parseInt(editVal, 10))}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditId(null)}>×</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className={cn("text-xs", item.stockCount === 0 ? "border-destructive/50 text-destructive" : item.stockCount < 5 ? "border-yellow-500/50 text-yellow-600" : "border-green-500/50 text-green-600")}>
                    {item.stockCount} in stock
                  </Badge>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setEditId(item.productId); setEditVal(String(item.stockCount)); }}>
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Stock Transfer Modal ─── */
function TransferModal({ locations, products, onClose, onSaved }: { locations: Location[]; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ fromLocationId: "", toLocationId: "", productId: "", quantity: "1", notes: "" });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.productId) { toast({ title: "Select a product", variant: "destructive" }); return; }
    if (!form.fromLocationId && !form.toLocationId) { toast({ title: "Select at least one branch", variant: "destructive" }); return; }
    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty) || qty < 1) { toast({ title: "Quantity must be at least 1", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api(`/stock-transfers`, {
        method: "POST",
        body: JSON.stringify({
          fromLocationId: form.fromLocationId ? parseInt(form.fromLocationId, 10) : undefined,
          toLocationId: form.toLocationId ? parseInt(form.toLocationId, 10) : undefined,
          productId: parseInt(form.productId, 10),
          quantity: qty,
          notes: form.notes || undefined,
        }),
      });
      toast({ title: "Stock transfer completed" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Transfer failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4" /> Stock Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From Branch</Label>
              <Select value={form.fromLocationId} onValueChange={v => setForm(p => ({ ...p, fromLocationId: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Source (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— External / None —</SelectItem>
                  {locations.filter(l => l.isActive).map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To Branch</Label>
              <Select value={form.toLocationId} onValueChange={v => setForm(p => ({ ...p, toLocationId: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Destination (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— External / None —</SelectItem>
                  {locations.filter(l => l.isActive).map(l => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={form.productId} onValueChange={v => setForm(p => ({ ...p, productId: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a product" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <Input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="h-9" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Processing…" : "Transfer Stock"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Transfer History ─── */
function TransferHistory({ refresh }: { refresh: number }) {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<StockTransfer[]>("/stock-transfers")
      .then(setTransfers)
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }, [refresh]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-6">Loading transfers…</p>;
  if (transfers.length === 0) return (
    <div className="text-center py-8">
      <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground">No stock transfers yet</p>
    </div>
  );

  return (
    <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
      {transfers.map(t => (
        <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/40">
          <div className="mt-0.5 h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-3 w-3 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t.productName ?? `Product #${t.productId}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-foreground/70">{t.fromLocationName ?? "External"}</span>
              <span className="mx-1">→</span>
              <span className="text-foreground/70">{t.toLocationName ?? "External"}</span>
            </p>
            {t.notes && <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{t.notes}</p>}
          </div>
          <div className="text-right shrink-0">
            <Badge variant="outline" className="text-xs border-blue-500/40 text-blue-500">{t.quantity} units</Badge>
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(t.createdAt), "MMM d, h:mm a")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─── */
export function Locations() {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoc, setSelectedLoc] = useState<Location | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editLoc, setEditLoc] = useState<Location | undefined>();
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferRefresh, setTransferRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState("branches");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [locs, prods] = await Promise.all([
        api<Location[]>("/locations"),
        api<Product[]>("/products"),
      ]);
      setLocations(locs);
      setProducts(prods);
      if (!selectedLoc && locs.length > 0) setSelectedLoc(locs[0]);
    } catch (e: any) {
      toast({ title: "Failed to load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [selectedLoc, toast]);

  useEffect(() => { load(); }, []);

  async function deactivate(loc: Location) {
    if (!confirm(`Deactivate "${loc.name}"?`)) return;
    try {
      await api(`/locations/${loc.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) });
      toast({ title: "Location deactivated" });
      await load();
      if (selectedLoc?.id === loc.id) setSelectedLoc(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  }

  const activeLocs = locations.filter(l => l.isActive);
  const inactiveLocs = locations.filter(l => !l.isActive);

  return (
    <>
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border bg-card/50 flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Branches
              </h2>
              <Button size="sm" className="h-7 text-xs gap-1 px-2" onClick={() => { setEditLoc(undefined); setShowAddModal(true); }}>
                <Plus className="h-3 w-3" /> New
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
            ) : locations.length === 0 ? (
              <div className="text-center py-6">
                <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No branches yet</p>
              </div>
            ) : (
              <>
                {activeLocs.map(loc => (
                  <button
                    key={loc.id}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between group",
                      selectedLoc?.id === loc.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                    onClick={() => setSelectedLoc(loc)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-medium">{loc.name}</span>
                    </div>
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  </button>
                ))}
                {inactiveLocs.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground px-3 pb-1">Inactive</p>
                    {inactiveLocs.map(loc => (
                      <button
                        key={loc.id}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm opacity-50 transition-colors flex items-center gap-2",
                          selectedLoc?.id === loc.id ? "bg-muted" : "hover:bg-muted"
                        )}
                        onClick={() => setSelectedLoc(loc)}
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{loc.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="p-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1"
              onClick={() => { setActiveTab("transfers"); setShowTransfer(true); }}
            >
              <ArrowLeftRight className="h-3 w-3" /> Transfer Stock
            </Button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-5 pb-0 border-b border-border flex items-center justify-between">
              <TabsList className="h-9">
                <TabsTrigger value="branches" className="text-xs">Branch Details</TabsTrigger>
                <TabsTrigger value="inventory" className="text-xs">Inventory</TabsTrigger>
                <TabsTrigger value="transfers" className="text-xs">Transfer History</TabsTrigger>
              </TabsList>
              {selectedLoc && (
                <div className="flex gap-2 pb-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setEditLoc(selectedLoc); setShowAddModal(true); }}>
                    <Edit2 className="h-3 w-3" /> Edit
                  </Button>
                  {selectedLoc.isActive && (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30" onClick={() => deactivate(selectedLoc)}>
                      <Trash2 className="h-3 w-3" /> Deactivate
                    </Button>
                  )}
                </div>
              )}
            </div>

            <TabsContent value="branches" className="flex-1 overflow-y-auto p-6 m-0">
              {!selectedLoc ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <Building2 className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-muted-foreground">Select a branch to view details</p>
                  <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Create First Branch
                  </Button>
                </div>
              ) : (
                <div className="max-w-lg space-y-5">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold">{selectedLoc.name}</h1>
                        <Badge variant={selectedLoc.isActive ? "default" : "secondary"} className="mt-0.5 text-xs">
                          {selectedLoc.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      {selectedLoc.address && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Address</p>
                            <p className="text-sm font-medium mt-0.5">{selectedLoc.address}</p>
                          </div>
                        </div>
                      )}
                      {selectedLoc.phone && (
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                          <Phone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm font-medium mt-0.5">{selectedLoc.phone}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Created</p>
                          <p className="text-sm font-medium mt-0.5">{format(new Date(selectedLoc.createdAt), "PPP")}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" className="gap-2" onClick={() => setActiveTab("inventory")}>
                      <Boxes className="h-4 w-4" /> Manage Inventory
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => setShowTransfer(true)}>
                      <ArrowLeftRight className="h-4 w-4" /> Transfer Stock
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="inventory" className="flex-1 overflow-y-auto p-6 m-0">
              {!selectedLoc ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <p className="text-muted-foreground">Select a branch first</p>
                </div>
              ) : (
                <div className="max-w-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold text-sm">Inventory — {selectedLoc.name}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage per-branch stock levels</p>
                    </div>
                  </div>
                  <InventoryPanel loc={selectedLoc} products={products} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="transfers" className="flex-1 overflow-y-auto p-6 m-0">
              <div className="max-w-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-sm">Transfer History</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">All stock movements between branches</p>
                  </div>
                  <Button size="sm" className="gap-1 text-xs h-8" onClick={() => setShowTransfer(true)}>
                    <ArrowLeftRight className="h-3.5 w-3.5" /> New Transfer
                  </Button>
                </div>
                <TransferHistory refresh={transferRefresh} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <LocationModal
          loc={editLoc}
          onClose={() => { setShowAddModal(false); setEditLoc(undefined); }}
          onSaved={async () => {
            await load();
          }}
        />
      )}
      {showTransfer && (
        <TransferModal
          locations={locations}
          products={products}
          onClose={() => setShowTransfer(false)}
          onSaved={() => { setTransferRefresh(r => r + 1); load(); }}
        />
      )}
    </>
  );
}
