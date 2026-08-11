/**
 * Materials & Cable dispatch tab (web POS).
 *
 * Dispatch-slip model borrowed from the field paper forms: office allocates
 * materials (optionally from inventory — stock is deducted on dispatch and
 * restored on return) to a work order; cable allocations carry a per-run
 * usage log (camera, port, start/end footage) that technicians also fill
 * in from the field app.
 */
import { useMemo, useState } from "react";
import {
  useWorkOrderAllocations,
  useCreateWorkOrderAllocation,
  useUpdateWorkOrderAllocation,
  useDeleteWorkOrderAllocation,
  useListProducts,
  type WorkOrderAllocation,
  type CableRun,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { Cable, Package, Plus, Trash2, Search, Undo2, ChevronDown, ChevronUp } from "lucide-react";

export function WorkOrderMaterials({ workOrderId, readOnly }: { workOrderId: number; readOnly?: boolean }) {
  const { toast } = useToast();
  const { staff } = useStaff();
  const { data: allocations, isLoading } = useWorkOrderAllocations(workOrderId);
  const createAlloc = useCreateWorkOrderAllocation();
  const updateAlloc = useUpdateWorkOrderAllocation();
  const deleteAlloc = useDeleteWorkOrderAllocation();

  const [showAdd, setShowAdd] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const err = (e: unknown) =>
    toast({ title: "Could not save", description: (e as Error)?.message, variant: "destructive" });

  const cables = (allocations ?? []).filter((a) => a.isCable);
  const materials = (allocations ?? []).filter((a) => !a.isCable);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Materials dispatched to this job. Inventory-linked items deduct stock when dispatched and restore it when returned.
        </p>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Dispatch Item
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>}
      {!isLoading && (allocations?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nothing dispatched yet. Add cable boxes, PVC, tools, and other materials for this job.</p>
          </CardContent>
        </Card>
      )}

      {cables.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cable Allocations</p>
          {cables.map((a) => (
            <AllocationCard
              key={a.id}
              a={a}
              open={openId === a.id}
              onToggle={() => setOpenId(openId === a.id ? null : a.id)}
              readOnly={!!readOnly}
              onUpdate={(data) => updateAlloc.mutate({ workOrderId, allocationId: a.id, ...data }, { onError: err })}
              onDelete={() => deleteAlloc.mutate({ workOrderId, allocationId: a.id }, { onError: err })}
            />
          ))}
        </div>
      )}

      {materials.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Materials & Tools</p>
          {materials.map((a) => (
            <AllocationCard
              key={a.id}
              a={a}
              open={openId === a.id}
              onToggle={() => setOpenId(openId === a.id ? null : a.id)}
              readOnly={!!readOnly}
              onUpdate={(data) => updateAlloc.mutate({ workOrderId, allocationId: a.id, ...data }, { onError: err })}
              onDelete={() => deleteAlloc.mutate({ workOrderId, allocationId: a.id }, { onError: err })}
            />
          ))}
        </div>
      )}

      <AddAllocationDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={(data) =>
          createAlloc.mutate(
            { workOrderId, staffId: staff?.id, ...data },
            { onSuccess: () => setShowAdd(false), onError: err },
          )
        }
        pending={createAlloc.isPending}
      />
    </div>
  );
}

/* ── Allocation card ───────────────────────────────────────────────────────── */

function AllocationCard({ a, open, onToggle, readOnly, onUpdate, onDelete }: {
  a: WorkOrderAllocation;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  onUpdate: (data: { qtyReturned?: number; runs?: CableRun[]; remarks?: string | null }) => void;
  onDelete: () => void;
}) {
  const usedFt = a.runs.reduce((s, r) => s + (r.lengthFt ?? 0), 0);
  const remainingFt = a.boxSizeFt != null ? a.boxSizeFt * a.qtyAllocated - usedFt : null;

  return (
    <Card>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {a.isCable ? <Cable className="h-4 w-4 text-primary shrink-0" /> : <Package className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{a.description}</p>
          <p className="text-xs text-muted-foreground">
            {a.qtyAllocated} {a.unit}
            {a.category ? ` · ${a.category}` : ""}
            {a.productId != null ? " · from inventory" : " · non-stock"}
            {a.dispatchedByName ? ` · by ${a.dispatchedByName}` : ""}
          </p>
        </div>
        {a.isCable && a.boxSizeFt != null && (
          <Badge variant="secondary" className="shrink-0">{usedFt} ft used · {remainingFt} ft left</Badge>
        )}
        {a.isReturnable && (
          <Badge variant={a.qtyReturned >= a.qtyAllocated ? "default" : "destructive"} className="shrink-0">
            {a.qtyReturned >= a.qtyAllocated ? "Returned" : "Tool — to return"}
          </Badge>
        )}
        {!a.isReturnable && a.qtyReturned > 0 && (
          <Badge variant="secondary" className="shrink-0">{a.qtyReturned} returned</Badge>
        )}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <CardContent className="pt-0 space-y-4">
          {a.isCable && (
            <CableRunLog
              key={`runs-${a.id}-${a.updatedAt}`}
              runs={a.runs}
              readOnly={readOnly}
              onSave={(runs) => onUpdate({ runs })}
            />
          )}
          {!readOnly && (
            <div className="flex items-end gap-3 flex-wrap">
              <ReturnControl key={`ret-${a.id}-${a.updatedAt}`} a={a} onUpdate={onUpdate} />
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => { if (confirm("Remove this allocation? Un-returned stock is restored.")) onDelete(); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function ReturnControl({ a, onUpdate }: {
  a: WorkOrderAllocation;
  onUpdate: (data: { qtyReturned?: number }) => void;
}) {
  const [val, setVal] = useState(String(a.qtyReturned || ""));
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label className="text-xs">Returned to office ({a.unit})</Label>
        <Input
          type="number"
          min={0}
          max={a.qtyAllocated}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="h-8 w-28"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onUpdate({ qtyReturned: Math.max(0, Math.min(Number(val) || 0, a.qtyAllocated)) })}
      >
        <Undo2 className="h-3.5 w-3.5 mr-1" /> Record return
      </Button>
    </div>
  );
}

/* ── Cable run log ─────────────────────────────────────────────────────────── */

function CableRunLog({ runs, readOnly, onSave }: {
  runs: CableRun[];
  readOnly: boolean;
  onSave: (runs: CableRun[]) => void;
}) {
  const [rows, setRows] = useState<CableRun[]>(runs);
  const [dirty, setDirty] = useState(false);

  const set = (i: number, patch: Partial<CableRun>) => {
    setRows((prev) => prev.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if (next.startFt != null && next.endFt != null && next.endFt >= next.startFt) {
        next.lengthFt = Math.round((next.endFt - next.startFt) * 100) / 100;
      }
      return next;
    }));
    setDirty(true);
  };

  const totalUsed = rows.reduce((s, r) => s + (r.lengthFt ?? 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Wire Allocation Log</p>
        <p className="text-xs text-muted-foreground">Total used: <span className="font-semibold">{totalUsed} ft</span></p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="text-left py-1.5 pr-2 font-medium">Run / Camera</th>
              <th className="text-left py-1.5 pr-2 font-medium">Location</th>
              <th className="text-left py-1.5 pr-2 font-medium">Port</th>
              <th className="text-left py-1.5 pr-2 font-medium">Start (ft)</th>
              <th className="text-left py-1.5 pr-2 font-medium">End (ft)</th>
              <th className="text-left py-1.5 pr-2 font-medium">Length</th>
              <th className="text-left py-1.5 pr-2 font-medium">Tested</th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-1 pr-2"><Input disabled={readOnly} className="h-7 text-xs w-24" value={r.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input disabled={readOnly} className="h-7 text-xs w-28" value={r.location ?? ""} onChange={(e) => set(i, { location: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input disabled={readOnly} className="h-7 text-xs w-16" value={r.port ?? ""} onChange={(e) => set(i, { port: e.target.value })} /></td>
                <td className="py-1 pr-2"><Input disabled={readOnly} type="number" className="h-7 text-xs w-20" value={r.startFt ?? ""} onChange={(e) => set(i, { startFt: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="py-1 pr-2"><Input disabled={readOnly} type="number" className="h-7 text-xs w-20" value={r.endFt ?? ""} onChange={(e) => set(i, { endFt: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="py-1 pr-2 font-semibold whitespace-nowrap">{r.lengthFt != null ? `${r.lengthFt} ft` : "—"}</td>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={r.tested === true}
                    onChange={(e) => set(i, { tested: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                </td>
                {!readOnly && (
                  <td className="py-1">
                    <button type="button" onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <div className="flex gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRows([...rows, { label: `CAM-${String(rows.length + 1).padStart(2, "0")}` }]); setDirty(true); }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add run
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => { onSave(rows); setDirty(false); }}>
            {dirty ? "Save runs" : "Saved"}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── Add dialog ────────────────────────────────────────────────────────────── */

function AddAllocationDialog({ open, onClose, onSubmit, pending }: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    productId?: number; description?: string; category?: string; unit?: string;
    qtyAllocated: number; isReturnable?: boolean; isCable?: boolean; boxSizeFt?: number; remarks?: string;
  }) => void;
  pending: boolean;
}) {
  const { data: products } = useListProducts();
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [qty, setQty] = useState("1");
  const [isCable, setIsCable] = useState(false);
  const [isReturnable, setIsReturnable] = useState(false);
  const [boxSizeFt, setBoxSizeFt] = useState("1000");

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [products, search]);

  const selected = products?.find((p) => p.id === productId);

  const reset = () => {
    setSearch(""); setProductId(null); setDescription(""); setCategory("");
    setUnit("pcs"); setQty("1"); setIsCable(false); setIsReturnable(false); setBoxSizeFt("1000");
  };

  const submit = () => {
    const q = Number(qty);
    if (!q || q <= 0) return;
    onSubmit({
      productId: productId ?? undefined,
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      unit: unit.trim() || "pcs",
      qtyAllocated: q,
      isCable,
      isReturnable,
      boxSizeFt: isCable && Number(boxSizeFt) > 0 ? Number(boxSizeFt) : undefined,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Dispatch Material</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Pick from inventory (deducts stock)</Label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search products…"
                value={selected ? selected.name : search}
                onChange={(e) => { setSearch(e.target.value); setProductId(null); }}
              />
            </div>
            {matches.length > 0 && productId == null && (
              <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex justify-between"
                    onClick={() => { setProductId(p.id); setDescription(p.name); setSearch(""); }}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">{p.stockCount ?? 0} in stock</span>
                  </button>
                ))}
              </div>
            )}
            {productId != null && (
              <button type="button" className="text-xs text-muted-foreground underline mt-1" onClick={() => { setProductId(null); setDescription(""); }}>
                Clear — use free-text item instead
              </button>
            )}
          </div>

          {productId == null && (
            <div>
              <Label className="text-xs">Item description (non-stock / purchased on site)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 20mm PVC Strap" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Qty</Label>
              <Input type="number" min={0.01} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs / length / box" />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="PVC / TOOL / CABLE" />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isCable} onChange={(e) => { setIsCable(e.target.checked); if (e.target.checked) { setUnit("box"); setCategory("CABLE"); } }} className="h-4 w-4 accent-primary" />
              Cable (track runs & footage)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isReturnable} onChange={(e) => setIsReturnable(e.target.checked)} className="h-4 w-4 accent-primary" />
              Tool (must be returned)
            </label>
          </div>

          {isCable && (
            <div>
              <Label className="text-xs">Box size (ft per box)</Label>
              <Input type="number" value={boxSizeFt} onChange={(e) => setBoxSizeFt(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !Number(qty) || (productId == null && !description.trim())}>
            {pending ? "Dispatching…" : "Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
