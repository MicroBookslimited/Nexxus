import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListCustomers,
  useListProducts,
  useListStaff,
  useGetSettings,
  useListWorkOrders,
  useGetWorkOrder,
  useCreateWorkOrder,
  useUpdateWorkOrder,
} from "@workspace/api-client-react";
import type { WorkOrder, WorkOrderItem, WorkOrderStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Search, Plus, Trash2, Eye, ShoppingCart, Ban } from "lucide-react";

/** Key used to hand a work order from this page to the POS cart loader. */
export const PENDING_WORK_ORDER_KEY = "nexxus_pending_work_order";

function formatCurrency(n: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(n || 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
  }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  received: "Received",
  in_progress: "In Progress",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  received: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  in_progress: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  collected: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

/** Valid next statuses shown as action buttons (mirrors server STATUS_FLOW). */
const NEXT_STATUS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received: ["in_progress", "cancelled"],
  in_progress: ["ready", "cancelled"],
  ready: ["in_progress", "cancelled"],
  collected: [],
  cancelled: [],
};

export default function WorkOrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: workOrders, isLoading } = useListWorkOrders();
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();
  const { data: staff } = useListStaff();
  const { data: settings } = useGetSettings();
  const createWO = useCreateWorkOrder();
  const updateWO = useUpdateWorkOrder();

  const currency = settings?.base_currency || "JMD";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkOrderStatus>("all");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { data: viewing } = useGetWorkOrder(viewingId);
  const [showCreate, setShowCreate] = useState(false);

  // ── Create form state ──
  const [custId, setCustId] = useState<number | "">("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [assignedStaffId, setAssignedStaffId] = useState<number | "">("");
  const [promisedDate, setPromisedDate] = useState("");
  const [notes, setNotes] = useState("");

  // ── Detail editing state ──
  const [diagnosis, setDiagnosis] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [laborDesc, setLaborDesc] = useState("");
  const [laborPrice, setLaborPrice] = useState("");

  const displayName = (wo: WorkOrder): string => {
    if (wo.customerId) return customers?.find((c) => c.id === wo.customerId)?.name ?? `Customer #${wo.customerId}`;
    return wo.contactName || "Walk-in";
  };

  const staffName = (id: number | null | undefined): string => {
    if (!id) return "Unassigned";
    return (staff ?? []).find((s: any) => s.id === id)?.name ?? `Staff #${id}`;
  };

  const filtered = useMemo(() => {
    const list = workOrders ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((wo) => {
      if (statusFilter !== "all" && wo.status !== statusFilter) return false;
      if (!q) return true;
      return (
        wo.workOrderNumber.toLowerCase().includes(q) ||
        displayName(wo).toLowerCase().includes(q) ||
        wo.itemDescription.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workOrders, search, statusFilter, customers]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter((p: any) => !p.archivedAt)
      .filter(
        (p: any) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase?.().includes(q) ||
          p.barcode?.toLowerCase?.().includes(q),
      )
      .slice(0, 8);
  }, [products, productSearch]);

  const resetCreateForm = () => {
    setCustId("");
    setContactName("");
    setContactPhone("");
    setItemDescription("");
    setProblemDescription("");
    setAssignedStaffId("");
    setPromisedDate("");
    setNotes("");
  };

  const handleCreate = () => {
    if (!itemDescription.trim()) { toast({ title: "Describe the item", variant: "destructive" }); return; }
    if (!problemDescription.trim()) { toast({ title: "Describe the problem", variant: "destructive" }); return; }
    if (!custId && !contactName.trim()) { toast({ title: "Select a customer or enter a contact name", variant: "destructive" }); return; }
    createWO.mutate(
      {
        ...(custId ? { customerId: Number(custId) } : {}),
        ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        itemDescription: itemDescription.trim(),
        problemDescription: problemDescription.trim(),
        ...(assignedStaffId ? { assignedStaffId: Number(assignedStaffId) } : {}),
        ...(promisedDate ? { promisedDate } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          toast({ title: `Work order ${created.workOrderNumber} created` });
          setShowCreate(false);
          resetCreateForm();
        },
        onError: (e: any) =>
          toast({ title: "Could not create work order", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const patchWO = (id: number, data: Parameters<typeof updateWO.mutate>[0] extends infer T ? Omit<T & object, "id"> : never, successMsg?: string) => {
    updateWO.mutate(
      { id, ...(data as object) },
      {
        onSuccess: () => { if (successMsg) toast({ title: successMsg }); },
        onError: (e: any) =>
          toast({ title: "Could not update work order", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const addPart = (p: any) => {
    if (!viewing) return;
    const items: WorkOrderItem[] = [
      ...viewing.items,
      {
        type: "part",
        productId: p.id,
        description: p.name,
        price: Number(p.price) || 0,
        quantity: 1,
        isTaxable: p.isTaxable !== false,
      },
    ];
    patchWO(viewing.id, { items });
    setProductSearch("");
  };

  const addLabor = () => {
    if (!viewing) return;
    const price = Number(laborPrice);
    if (!laborDesc.trim() || !Number.isFinite(price) || price < 0) {
      toast({ title: "Enter a labor description and price", variant: "destructive" });
      return;
    }
    const items: WorkOrderItem[] = [
      ...viewing.items,
      { type: "labor", description: laborDesc.trim(), price, quantity: 1, isTaxable: true },
    ];
    patchWO(viewing.id, { items });
    setLaborDesc("");
    setLaborPrice("");
  };

  const removeItem = (idx: number) => {
    if (!viewing) return;
    patchWO(viewing.id, { items: viewing.items.filter((_, i) => i !== idx) });
  };

  const setItemQty = (idx: number, qty: number) => {
    if (!viewing) return;
    patchWO(viewing.id, {
      items: viewing.items.map((it, i) => (i === idx ? { ...it, quantity: Math.max(1, qty) } : it)),
    });
  };

  const handleChargeInPos = (wo: WorkOrder) => {
    if (wo.items.length === 0) {
      toast({ title: "Add parts or labor first", variant: "destructive" });
      return;
    }
    sessionStorage.setItem(
      PENDING_WORK_ORDER_KEY,
      JSON.stringify({
        id: wo.id,
        workOrderNumber: wo.workOrderNumber,
        items: wo.items,
        discountAmount: wo.discountAmount ?? 0,
        customerId: wo.customerId ?? null,
        notes: `Work order ${wo.workOrderNumber}: ${wo.itemDescription}`,
      }),
    );
    setLocation("/pos");
  };

  const isTerminal = (s: WorkOrderStatus) => s === "collected" || s === "cancelled";

  // Route-level module gate: nav is already hidden, but block direct URL access too.
  if (settings && settings.work_orders_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Work Orders module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Work Orders</h1>
            <p className="text-sm text-muted-foreground">
              Track repair jobs from intake to collection — charge them in the POS when ready.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Work Order
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by number, customer or item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "received", "in_progress", "ready", "collected", "cancelled"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading work orders…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No work orders found.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((wo) => (
            <Card key={wo.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[130px]">
                  <p className="font-semibold">{wo.workOrderNumber}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(wo.createdAt)}</p>
                </div>
                <div className="flex-1 min-w-[160px]">
                  <p className="text-sm truncate">{wo.itemDescription}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {displayName(wo)} · {staffName(wo.assignedStaffId)}
                    {wo.promisedDate ? ` · due ${fmtDate(wo.promisedDate)}` : ""}
                  </p>
                </div>
                <div className="text-right min-w-[100px]">
                  <p className="font-semibold">{formatCurrency(wo.total, currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {wo.items.length} line{wo.items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant="outline" className={STATUS_STYLES[wo.status]}>
                  {STATUS_LABEL[wo.status]}
                </Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setViewingId(wo.id); setDiagnosis(wo.diagnosis ?? ""); }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {wo.status === "ready" && !wo.convertedOrderId && (
                    <Button size="sm" onClick={() => handleChargeInPos(wo)}>
                      <ShoppingCart className="h-4 w-4 mr-1" /> Charge
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Work Order</DialogTitle>
            <DialogDescription>Record the item, the problem, and who it belongs to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer</Label>
              <select
                className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={custId}
                onChange={(e) => setCustId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Walk-in (use contact fields below)</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {!custId && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Contact name *</Label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Contact phone</Label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
            <div>
              <Label>Item description *</Label>
              <Input
                placeholder="e.g. Samsung TV 55”, iPhone 12, lawnmower…"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Problem description *</Label>
              <Textarea
                placeholder="What's wrong with it?"
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assign to</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={assignedStaffId}
                  onChange={(e) => setAssignedStaffId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Unassigned</option>
                  {(staff ?? []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Promised date</Label>
                <Input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createWO.isPending}>
              {createWO.isPending ? "Creating…" : "Create Work Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog ── */}
      <Dialog open={viewingId != null} onOpenChange={(o) => { if (!o) setViewingId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewing.workOrderNumber}
                  <Badge variant="outline" className={STATUS_STYLES[viewing.status]}>
                    {STATUS_LABEL[viewing.status]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {displayName(viewing)}{viewing.contactPhone ? ` · ${viewing.contactPhone}` : ""} · {staffName(viewing.assignedStaffId)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium">{viewing.itemDescription}</p>
                  <p className="text-muted-foreground">{viewing.problemDescription}</p>
                  {viewing.promisedDate && (
                    <p className="text-xs text-muted-foreground mt-1">Promised: {fmtDate(viewing.promisedDate)}</p>
                  )}
                </div>

                {!isTerminal(viewing.status) && (
                  <div>
                    <Label>Diagnosis / work notes</Label>
                    <Textarea
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      onBlur={() => {
                        if (diagnosis !== (viewing.diagnosis ?? "")) patchWO(viewing.id, { diagnosis });
                      }}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                )}
                {isTerminal(viewing.status) && viewing.diagnosis && (
                  <p className="text-xs text-muted-foreground">Diagnosis: {viewing.diagnosis}</p>
                )}

                {!isTerminal(viewing.status) && (
                  <div>
                    <Label>Assigned to</Label>
                    <select
                      className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={viewing.assignedStaffId ?? ""}
                      onChange={(e) =>
                        patchWO(viewing.id, { assignedStaffId: e.target.value ? Number(e.target.value) : null }, "Assignment updated")
                      }
                    >
                      <option value="">Unassigned</option>
                      {(staff ?? []).map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <p className="font-medium mb-1">Parts &amp; labor</p>
                  <div className="space-y-1.5">
                    {viewing.items.length === 0 && (
                      <p className="text-xs text-muted-foreground">No parts or labor added yet.</p>
                    )}
                    {viewing.items.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                        <Badge variant="outline" className="capitalize shrink-0">{it.type}</Badge>
                        <span className="flex-1 truncate">{it.description}</span>
                        {!isTerminal(viewing.status) ? (
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => setItemQty(idx, Math.floor(Number(e.target.value) || 1))}
                            className="w-14 h-7 text-center"
                          />
                        ) : (
                          <span className="text-xs">×{it.quantity}</span>
                        )}
                        <span className="w-20 text-right">{formatCurrency(it.price * it.quantity, currency)}</span>
                        {!isTerminal(viewing.status) && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500" onClick={() => removeItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!isTerminal(viewing.status) && (
                    <div className="mt-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Add part — search products…"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="pl-9"
                        />
                        {productMatches.length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
                            {productMatches.map((p: any) => (
                              <button
                                key={p.id}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex justify-between gap-2"
                                onClick={() => addPart(p)}
                              >
                                <span className="truncate">{p.name}</span>
                                <span className="text-muted-foreground shrink-0">{formatCurrency(Number(p.price) || 0, currency)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Labor description…"
                          value={laborDesc}
                          onChange={(e) => setLaborDesc(e.target.value)}
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Price"
                          value={laborPrice}
                          onChange={(e) => setLaborPrice(e.target.value)}
                          className="w-28"
                        />
                        <Button variant="outline" onClick={addLabor}>Add</Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(viewing.subtotal, currency)}</span></div>
                  <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(viewing.tax, currency)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(viewing.total, currency)}</span></div>
                </div>

                {viewing.notes && <p className="text-xs text-muted-foreground">{viewing.notes}</p>}

                {NEXT_STATUS[viewing.status].length > 0 && (
                  <div className="flex gap-2 flex-wrap pt-1">
                    {NEXT_STATUS[viewing.status].map((next) => (
                      <Button
                        key={next}
                        size="sm"
                        variant={next === "cancelled" ? "destructive" : "default"}
                        onClick={() => patchWO(viewing.id, { status: next }, `Moved to ${STATUS_LABEL[next]}`)}
                        disabled={updateWO.isPending}
                      >
                        {next === "cancelled" ? <Ban className="h-4 w-4 mr-1" /> : null}
                        {next === "cancelled" ? "Cancel Job" : `Mark ${STATUS_LABEL[next]}`}
                      </Button>
                    ))}
                    {viewing.status === "ready" && !viewing.convertedOrderId && (
                      <Button size="sm" variant="outline" onClick={() => handleChargeInPos(viewing)}>
                        <ShoppingCart className="h-4 w-4 mr-1" /> Charge in POS
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
