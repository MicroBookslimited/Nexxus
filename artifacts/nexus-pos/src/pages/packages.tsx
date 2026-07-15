import { useState, useMemo, useRef, useEffect } from "react";
import {
  useGetSettings,
  useListPackages,
  useReceivePackage,
  useUpdatePackage,
  useCancelPackage,
} from "@workspace/api-client-react";
import type { StorePackage, PackageStatus, ReceivePackageInput } from "@workspace/api-client-react";
import { useStaff } from "@/contexts/StaffContext";
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
import { PackageCheck, Search, Plus, Eye, Ban, Pencil } from "lucide-react";

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

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const STATUS_LABEL: Record<PackageStatus, string> = {
  received: "In Store",
  collected: "Collected",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<PackageStatus, string> = {
  received: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  collected: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

type FormState = {
  trackingNumber: string;
  awb: string;
  purchaseTrackingNumber: string;
  customerName: string;
  customerPhone: string;
  courier: string;
  weight: string;
  weightUnit: "lb" | "kg";
  shelfLocation: string;
  fee: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  trackingNumber: "",
  awb: "",
  purchaseTrackingNumber: "",
  customerName: "",
  customerPhone: "",
  courier: "",
  weight: "",
  weightUnit: "lb",
  shelfLocation: "",
  fee: "",
  notes: "",
};

export default function PackagesPage() {
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const { staff: sessionStaff } = useStaff();
  const currency = settings?.currency || "JMD";

  const [statusFilter, setStatusFilter] = useState<string>("received");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: packages = [], isLoading } = useListPackages({
    status: statusFilter,
    search: debouncedSearch || undefined,
  });

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<StorePackage | null>(null);
  const [viewing, setViewing] = useState<StorePackage | null>(null);
  const [cancelling, setCancelling] = useState<StorePackage | null>(null);
  const trackingInputRef = useRef<HTMLInputElement>(null);

  const receiveMutation = useReceivePackage();
  const updateMutation = useUpdatePackage();
  const cancelMutation = useCancelPackage();

  const counts = useMemo(() => {
    const inStore = packages.filter((p) => p.status === "received");
    return {
      inStore: inStore.length,
      feesPending: inStore.reduce((s, p) => s + (p.fee || 0), 0),
    };
  }, [packages]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openReceive(prefillTracking?: string) {
    setForm(prefillTracking ? { ...EMPTY_FORM, trackingNumber: prefillTracking } : EMPTY_FORM);
    setEditing(null);
    setReceiveOpen(true);
    setTimeout(() => trackingInputRef.current?.focus(), 50);
  }

  // ── Barcode scan → open Receive form ─────────────────────────────────────
  // USB/HID barcode scanners "type" the code as a rapid keystroke burst ending
  // with Enter. When the receive dialog is NOT open, detect such a burst
  // anywhere on the page and open the Receive form with the tracking number
  // prefilled. Human typing is too slow to trigger this (>50ms between keys).
  const anyDialogOpen = receiveOpen || !!viewing || !!cancelling;
  const scanRef = useRef({ buffer: "", lastTs: 0 });
  useEffect(() => {
    if (anyDialogOpen) return;
    const MAX_GAP_MS = 50;
    const MIN_LEN = 4;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const s = scanRef.current;
      const now = Date.now();
      if (now - s.lastTs > MAX_GAP_MS) s.buffer = "";
      s.lastTs = now;
      if (e.key === "Enter") {
        const code = s.buffer;
        s.buffer = "";
        if (code.length >= MIN_LEN) {
          e.preventDefault();
          // If the burst was typed into the search box, undo it there.
          const target = e.target as HTMLElement | null;
          if (target instanceof HTMLInputElement && target.value.endsWith(code)) {
            setSearch((prev) => (prev.endsWith(code) ? prev.slice(0, -code.length) : prev));
          }
          openReceive(code);
        }
        return;
      }
      if (e.key.length === 1) s.buffer += e.key;
      else if (e.key !== "Shift") s.buffer = "";
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyDialogOpen]);

  function openEdit(pkg: StorePackage) {
    setForm({
      trackingNumber: pkg.trackingNumber,
      awb: pkg.awb ?? "",
      purchaseTrackingNumber: pkg.purchaseTrackingNumber ?? "",
      customerName: pkg.customerName ?? "",
      customerPhone: pkg.customerPhone ?? "",
      courier: pkg.courier ?? "",
      weight: pkg.weight != null ? String(pkg.weight) : "",
      weightUnit: pkg.weightUnit === "kg" ? "kg" : "lb",
      shelfLocation: pkg.shelfLocation ?? "",
      fee: String(pkg.fee ?? 0),
      notes: pkg.notes ?? "",
    });
    setEditing(pkg);
    setViewing(null);
    setReceiveOpen(true);
  }

  function buildPayload(): ReceivePackageInput | null {
    const trackingNumber = form.trackingNumber.trim();
    if (!trackingNumber) {
      toast({ title: "Tracking number is required", variant: "destructive" });
      return null;
    }
    const fee = parseFloat(form.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      toast({ title: "Enter a valid fee (0 or more)", variant: "destructive" });
      return null;
    }
    const weight = form.weight.trim() ? parseFloat(form.weight) : undefined;
    if (form.weight.trim() && (!Number.isFinite(weight!) || weight! < 0)) {
      toast({ title: "Enter a valid weight", variant: "destructive" });
      return null;
    }
    return {
      trackingNumber,
      awb: form.awb.trim() || undefined,
      purchaseTrackingNumber: form.purchaseTrackingNumber.trim() || undefined,
      customerName: form.customerName.trim() || undefined,
      customerPhone: form.customerPhone.trim() || undefined,
      courier: form.courier.trim() || undefined,
      weight,
      weightUnit: form.weightUnit,
      shelfLocation: form.shelfLocation.trim() || undefined,
      fee,
      notes: form.notes.trim() || undefined,
      ...(sessionStaff ? { staffId: sessionStaff.id, staffName: sessionStaff.name } : {}),
    };
  }

  function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, ...payload },
        {
          onSuccess: () => {
            toast({ title: "Package updated" });
            setReceiveOpen(false);
            setEditing(null);
          },
          onError: (e: any) =>
            toast({ title: "Could not update package", description: e?.message, variant: "destructive" }),
        },
      );
    } else {
      receiveMutation.mutate(payload, {
        onSuccess: (pkg) => {
          toast({ title: "Package received", description: `${pkg.trackingNumber} — fee ${formatCurrency(pkg.fee, currency)}` });
          // Keep the dialog open with a fresh form for rapid back-to-back receiving.
          setForm(EMPTY_FORM);
          setTimeout(() => trackingInputRef.current?.focus(), 50);
        },
        onError: (e: any) =>
          toast({ title: "Could not receive package", description: e?.message, variant: "destructive" }),
      });
    }
  }

  function handleCancel(pkg: StorePackage) {
    cancelMutation.mutate(
      { id: pkg.id },
      {
        onSuccess: () => {
          toast({ title: "Package cancelled", description: pkg.trackingNumber });
          setCancelling(null);
          setViewing(null);
        },
        onError: (e: any) =>
          toast({ title: "Could not cancel package", description: e?.message, variant: "destructive" }),
      },
    );
  }

  // Route-level module gate: nav is already hidden, but block direct URL access too.
  if (settings && settings.packages_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Package / Shipping Service module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules.</p>
      </div>
    );
  }

  const saving = receiveMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-sky-500" />
          <h1 className="text-xl font-semibold">Packages</h1>
          {statusFilter === "received" && (
            <span className="text-sm text-muted-foreground">
              {counts.inStore} in store · {formatCurrency(counts.feesPending, currency)} in pending fees
            </span>
          )}
        </div>
        <Button onClick={() => openReceive()}>
          <Plus className="h-4 w-4 mr-1" /> Receive Package
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tracking #, AWB, customer, courier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: "received", label: "In Store" },
            { key: "collected", label: "Collected" },
            { key: "cancelled", label: "Cancelled" },
            { key: "all", label: "All" },
          ].map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={statusFilter === f.key ? "default" : "outline"}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : packages.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No packages found. Click "Receive Package" to scan one in.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Tracking #</th>
                    <th className="px-4 py-2.5 font-medium">Customer</th>
                    <th className="px-4 py-2.5 font-medium">Courier</th>
                    <th className="px-4 py-2.5 font-medium">Shelf</th>
                    <th className="px-4 py-2.5 font-medium text-right">Fee</th>
                    <th className="px-4 py-2.5 font-medium">Received</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((pkg) => (
                    <tr key={pkg.id} className="border-b border-border/50 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-mono text-xs">{pkg.trackingNumber}</td>
                      <td className="px-4 py-2.5">
                        <div>{pkg.customerName || "—"}</div>
                        {pkg.customerPhone && (
                          <div className="text-xs text-muted-foreground">{pkg.customerPhone}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{pkg.courier || "—"}</td>
                      <td className="px-4 py-2.5">{pkg.shelfLocation || "—"}</td>
                      <td className="px-4 py-2.5 text-right">{formatCurrency(pkg.fee, currency)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDateTime(pkg.receivedAt)}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={STATUS_STYLES[pkg.status]}>
                          {STATUS_LABEL[pkg.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(pkg)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {pkg.status === "received" && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(pkg)} title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-500 hover:text-rose-600"
                              onClick={() => setCancelling(pkg)}
                              title="Cancel"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receive / Edit dialog */}
      <Dialog open={receiveOpen} onOpenChange={(o) => { if (!o) { setReceiveOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Package" : "Receive Package"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update this package's details."
                : "Scan or type the tracking number, enter the pickup fee and details."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tracking Number *</Label>
              <Input
                ref={trackingInputRef}
                value={form.trackingNumber}
                onChange={(e) => set("trackingNumber", e.target.value)}
                placeholder="Scan or type tracking number"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>AWB</Label>
                <Input value={form.awb} onChange={(e) => set("awb", e.target.value)} placeholder="Air waybill #" />
              </div>
              <div>
                <Label>Purchase Tracking #</Label>
                <Input
                  value={form.purchaseTrackingNumber}
                  onChange={(e) => set("purchaseTrackingNumber", e.target.value)}
                  placeholder="Merchant tracking #"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Customer Name</Label>
                <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
              </div>
              <div>
                <Label>Customer Phone</Label>
                <Input value={form.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Courier</Label>
                <Input value={form.courier} onChange={(e) => set("courier", e.target.value)} placeholder="e.g. FedEx, DHL" />
              </div>
              <div>
                <Label>Shelf / Bin Location</Label>
                <Input value={form.shelfLocation} onChange={(e) => set("shelfLocation", e.target.value)} placeholder="e.g. A-12" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Weight</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.weight}
                  onChange={(e) => set("weight", e.target.value)}
                />
              </div>
              <div>
                <Label>Unit</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.weightUnit}
                  onChange={(e) => set("weightUnit", e.target.value === "kg" ? "kg" : "lb")}
                >
                  <option value="lb">lb</option>
                  <option value="kg">kg</option>
                </select>
              </div>
              <div>
                <Label>Fee ({currency}) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.fee}
                  onChange={(e) => set("fee", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReceiveOpen(false); setEditing(null); }}>
              Close
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Receive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-base">{viewing.trackingNumber}</DialogTitle>
                <DialogDescription>
                  <Badge variant="outline" className={STATUS_STYLES[viewing.status]}>
                    {STATUS_LABEL[viewing.status]}
                  </Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="text-muted-foreground">AWB</div><div>{viewing.awb || "—"}</div>
                <div className="text-muted-foreground">Purchase Tracking #</div><div>{viewing.purchaseTrackingNumber || "—"}</div>
                <div className="text-muted-foreground">Customer</div><div>{viewing.customerName || "—"}</div>
                <div className="text-muted-foreground">Phone</div><div>{viewing.customerPhone || "—"}</div>
                <div className="text-muted-foreground">Courier</div><div>{viewing.courier || "—"}</div>
                <div className="text-muted-foreground">Weight</div>
                <div>{viewing.weight != null ? `${viewing.weight} ${viewing.weightUnit || "lb"}` : "—"}</div>
                <div className="text-muted-foreground">Shelf / Bin</div><div>{viewing.shelfLocation || "—"}</div>
                <div className="text-muted-foreground">Fee</div><div>{formatCurrency(viewing.fee, currency)}</div>
                <div className="text-muted-foreground">Received</div>
                <div>{fmtDateTime(viewing.receivedAt)}{viewing.receivedByStaffName ? ` · ${viewing.receivedByStaffName}` : ""}</div>
                {viewing.status === "collected" && (
                  <>
                    <div className="text-muted-foreground">Collected</div>
                    <div>
                      {fmtDateTime(viewing.collectedAt)}
                      {viewing.collectedByStaffName ? ` · ${viewing.collectedByStaffName}` : ""}
                      {viewing.collectedOrderId ? ` · Order #${viewing.collectedOrderId}` : ""}
                    </div>
                  </>
                )}
                {viewing.notes && (
                  <>
                    <div className="text-muted-foreground">Notes</div><div>{viewing.notes}</div>
                  </>
                )}
              </div>
              <DialogFooter>
                {viewing.status === "received" && (
                  <>
                    <Button variant="outline" onClick={() => openEdit(viewing)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="text-rose-500"
                      onClick={() => { setCancelling(viewing); }}
                    >
                      <Ban className="h-4 w-4 mr-1" /> Cancel Package
                    </Button>
                  </>
                )}
                <Button onClick={() => setViewing(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirm */}
      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel package?</DialogTitle>
            <DialogDescription>
              {cancelling?.trackingNumber} will be marked cancelled (e.g. returned to sender). It can no longer be
              collected at the POS.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => cancelling && handleCancel(cancelling)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? "Cancelling…" : "Cancel Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
