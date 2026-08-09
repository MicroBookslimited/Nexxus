import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetWorkOrder,
  useUpdateWorkOrder,
  useDeleteWorkOrder,
  useListCustomers,
  useListProducts,
  useListStaff,
  useGetSettings,
  useWorkOrderNotes,
  useWorkOrderPhotos,
  useAddWorkOrderNote,
  useDeleteWorkOrderNote,
  useWorkOrderHistory,
  useWorkOrderAppointments,
  useCreateWorkOrderAppointment,
  useUpdateWorkOrderAppointment,
  useDeleteWorkOrderAppointment,
} from "@workspace/api-client-react";
import type { WorkOrder, WorkOrderStatus, WorkOrderNote, WorkOrderAppointment } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, ShoppingCart, Printer, Wrench, ChevronDown,
  Plus, Trash2, Search, Clock, MessageSquare, Calendar,
  FileText, Activity, Lock, Pencil, Check, X,
  ChevronRight, Save, ClipboardList,
} from "lucide-react";
import { WorkOrderInstallForm } from "@/components/WorkOrderInstallForm";
import { PENDING_WORK_ORDER_KEY, STATUS_LABEL, STATUS_STYLES, woStatusLabel } from "@/pages/work-orders";
import { generateJobCard } from "@/lib/work-order-doc";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";
import { useStaff } from "@/contexts/StaffContext";
import { PinPad } from "@/components/PinPad";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import type { SignatureCanvasHandle } from "@/components/SignatureCanvas";

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatCurrency(n: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n || 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
  }
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
const PRIORITY_COLOR: Record<string, string> = {
  low: "text-slate-400", normal: "", high: "text-amber-500", urgent: "text-orange-500 font-semibold", emergency: "text-rose-500 font-bold",
};

// Valid next statuses
const NEXT_STATUS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["ready", "awaiting_parts", "on_hold", "received", "cancelled"],
  awaiting_parts: ["in_progress", "on_hold", "cancelled"],
  on_hold: ["in_progress", "awaiting_parts", "received", "cancelled"],
  ready: ["collected", "in_progress", "cancelled"],
  collected: [], cancelled: [],
};

const APPT_TYPE_LABEL: Record<string, string> = {
  assessment: "Assessment", repair: "Repair", installation: "Installation",
  site_visit: "Site Visit", pickup: "Pickup", delivery: "Delivery", follow_up: "Follow-up",
};
const APPT_STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  confirmed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  completed: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  no_show: "bg-slate-500/15 text-slate-500 border-slate-500/30",
};

type Tab = "overview" | "items" | "install" | "notes" | "appointments" | "history" | "jobcard";

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function WorkOrderDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = idParam ? parseInt(idParam, 10) : null;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { profile } = useBusinessProfile();

  const { data: wo, isLoading } = useGetWorkOrder(id);
  const { data: settings } = useGetSettings();
  const { data: customers } = useListCustomers();
  const { data: staff } = useListStaff();
  const { data: products } = useListProducts();
  const updateWO = useUpdateWorkOrder();
  const deleteWO = useDeleteWorkOrder();

  const [tab, setTab] = useState<Tab>("overview");
  const [showMove, setShowMove] = useState(false);
  const [statusNote, setStatusNote] = useState("");

  const currency = settings?.base_currency || "JMD";
  const isTerminal = wo?.status === "collected" || wo?.status === "cancelled";

  // Staff PIN gate
  const { staff: sessionStaff, setStaff } = useStaff();
  const [locked, setLocked] = useState(() => !sessionStaff);

  // Digital signature collection for "collected" transition
  const [showSigDialog, setShowSigDialog] = useState(false);
  const [sigStatusNote, setSigStatusNote] = useState("");
  const [customerSigned, setCustomerSigned] = useState(false);
  const [staffSigned, setStaffSigned] = useState(false);
  const customerSigRef = useRef<SignatureCanvasHandle | null>(null);
  const staffSigRef = useRef<SignatureCanvasHandle | null>(null);

  useEffect(() => {
    if (showSigDialog) {
      setCustomerSigned(false);
      setStaffSigned(false);
      // Allow the dialog to mount before clearing canvases
      setTimeout(() => {
        customerSigRef.current?.clear();
        staffSigRef.current?.clear();
      }, 50);
    }
  }, [showSigDialog]);

  const patchWO = (data: Parameters<typeof updateWO.mutate>[0] extends { id: number } & infer R ? R : never, msg?: string) => {
    if (!wo) return;
    updateWO.mutate(
      { id: wo.id, ...(data as object) },
      {
        onSuccess: () => { if (msg) toast({ title: msg }); },
        onError: (e: any) => toast({ title: "Could not update", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const handleChargeInPos = () => {
    if (!wo) return;
    if (wo.items.length === 0) { toast({ title: "Add parts or labor first", variant: "destructive" }); return; }
    sessionStorage.setItem(PENDING_WORK_ORDER_KEY, JSON.stringify({
      id: wo.id, workOrderNumber: wo.workOrderNumber, items: wo.items,
      discountAmount: wo.discountAmount ?? 0, customerId: wo.customerId ?? null,
      notes: `Work order ${wo.workOrderNumber}: ${wo.itemDescription}`,
    }));
    setLocation("/pos");
  };

  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printPrices, setPrintPrices] = useState(false);

  const doPrint = (withPrices: boolean) => {
    if (!wo) return;
    const portalUrl = wo.portalToken
      ? `${window.location.origin}/wo/${wo.id}/${wo.portalToken}`
      : undefined;
    const html = generateJobCard(wo, { businessName: profile?.businessName, currency, portalUrl, showPrices: withPrices });
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
    else { toast({ title: "Pop-up blocked", description: "Allow pop-ups to print the job card", variant: "destructive" }); }
  };

  const handlePrintJobCard = () => setShowPrintDialog(true);

  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 w-full max-w-xs px-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2 justify-center">
              <Wrench className="h-5 w-5 text-amber-500" /> Work Orders
            </h2>
            <p className="text-sm text-muted-foreground">Enter your PIN to access this module</p>
          </div>
          <PinPad
            onSuccess={(s) => { setStaff(s); setLocked(false); }}
            title="Staff PIN Required"
            pinLength={4}
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>Loading work order…</p>
      </div>
    );
  }
  if (!wo) {
    return (
      <div className="p-8 text-center">
        <p className="font-medium">Work order not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/work-orders")}>Back to list</Button>
      </div>
    );
  }

  const clientName = wo.customerName || wo.contactName || "Walk-in";
  const clientPhone = wo.customerPhone || wo.contactPhone || "";

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "Overview", icon: FileText },
    { key: "items", label: "Parts & Labour", icon: Wrench },
    { key: "install", label: "Installation", icon: ClipboardList },
    { key: "notes", label: "Notes", icon: MessageSquare },
    { key: "appointments", label: "Appointments", icon: Calendar },
    { key: "history", label: "History", icon: Activity },
    { key: "jobcard", label: "Job Card", icon: Printer },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Breadcrumb + actions ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/work-orders")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Work Orders
          </Button>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono font-semibold text-sm">{wo.workOrderNumber}</span>
          <Badge variant="outline" className={`${STATUS_STYLES[wo.status as WorkOrderStatus]} text-xs`}>
            {woStatusLabel(wo.status, wo.serviceChannel)}
          </Badge>
          {wo.priority && wo.priority !== "normal" && (
            <span className={`text-xs font-semibold ${PRIORITY_COLOR[wo.priority]}`}>
              {wo.priority.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isTerminal && (
            <Button variant="outline" size="sm" onClick={() => setShowMove(true)}>
              <ChevronDown className="h-4 w-4 mr-1" /> Move Status
            </Button>
          )}
          {wo.status === "ready" && !wo.convertedOrderId && (
            <Button size="sm" onClick={handleChargeInPos}>
              <ShoppingCart className="h-4 w-4 mr-1" /> Charge in POS
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrintJobCard}>
            <Printer className="h-4 w-4 mr-1" /> Job Card
          </Button>
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div className="border-b flex gap-1 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === "overview" && (
        <OverviewTab wo={wo} customers={customers ?? []} staff={staff ?? []} currency={currency} onPatch={patchWO} />
      )}
      {tab === "items" && (
        <ItemsTab wo={wo} products={products ?? []} currency={currency} onPatch={patchWO} />
      )}
      {tab === "install" && (
        <WorkOrderInstallForm wo={wo} readOnly={isTerminal} onPatch={(updates) => patchWO(updates as never)} />
      )}
      {tab === "notes" && <NotesTab workOrderId={wo.id} />}
      {tab === "appointments" && <AppointmentsTab workOrderId={wo.id} staff={staff ?? []} />}
      {tab === "history" && <HistoryTab workOrderId={wo.id} serviceChannel={wo.serviceChannel} />}
      {tab === "jobcard" && (
        <JobCardTab wo={wo} currency={currency} onPrint={handlePrintJobCard} />
      )}

      {/* ── Move status dialog ── */}
      {/* ── Print options dialog ── */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4" /> Print Job Card
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="flex items-center gap-3 cursor-pointer rounded-md p-3 hover:bg-muted/50 border border-border">
              <input
                type="checkbox"
                checked={printPrices}
                onChange={(e) => setPrintPrices(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <p className="text-sm font-medium">Include part prices</p>
                <p className="text-xs text-muted-foreground">Shows unit cost and line totals on the printed document</p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintDialog(false)}>Cancel</Button>
            <Button onClick={() => { setShowPrintDialog(false); doPrint(printPrices); }}>
              <Printer className="h-4 w-4 mr-1.5" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Digital signature collection dialog ── */}
      <Dialog open={showSigDialog} onOpenChange={setShowSigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-4 w-4" /> Collect Signatures to Complete
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Both the customer and a staff member must sign before this work order can be marked as collected.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                Customer Signature
                {customerSigned && <span className="text-emerald-500 text-xs font-normal">✓ Signed</span>}
              </p>
              <SignatureCanvas
                ref={customerSigRef}
                onChange={(signed) => setCustomerSigned(signed)}
              />
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                onClick={() => { customerSigRef.current?.clear(); setCustomerSigned(false); }}
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                Staff Signature
                {staffSigned && <span className="text-emerald-500 text-xs font-normal">✓ Signed</span>}
              </p>
              <SignatureCanvas
                ref={staffSigRef}
                onChange={(signed) => setStaffSigned(signed)}
              />
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                onClick={() => { staffSigRef.current?.clear(); setStaffSigned(false); }}
              >
                Clear
              </button>
            </div>
          </div>
          {(!customerSigned || !staffSigned) && (
            <p className="text-xs text-amber-500">
              {!customerSigned && !staffSigned
                ? "Both customer and staff signatures are required"
                : !customerSigned
                  ? "Customer signature required"
                  : "Staff signature required"}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSigDialog(false)}>Cancel</Button>
            <Button
              disabled={!customerSigned || !staffSigned}
              onClick={() => {
                const cSig = customerSigRef.current?.getDataUrl() ?? "";
                const sSig = staffSigRef.current?.getDataUrl() ?? "";
                patchWO({
                  status: "collected",
                  customerSignature: cSig,
                  staffSignature: sSig,
                  ...(sigStatusNote ? { statusNote: sigStatusNote } : {}),
                } as any, "Work order collected");
                setShowSigDialog(false);
              }}
            >
              <Check className="h-4 w-4 mr-1.5" /> Complete &amp; Collect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMove} onOpenChange={setShowMove}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Move Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Current: <strong>{woStatusLabel(wo.status, wo.serviceChannel)}</strong></p>
            <div className="space-y-2">
              {(NEXT_STATUS[wo.status as WorkOrderStatus] ?? []).map((next) => (
                <Button
                  key={next}
                  variant={next === "cancelled" ? "destructive" : "outline"}
                  className="w-full justify-start"
                  onClick={() => {
                    if (next === "collected") {
                      setSigStatusNote(statusNote.trim());
                      setShowMove(false);
                      setStatusNote("");
                      setShowSigDialog(true);
                    } else {
                      patchWO({ status: next, ...(statusNote.trim() ? { statusNote: statusNote.trim() } : {}) } as any, `Moved to ${woStatusLabel(next, wo.serviceChannel)}`);
                      setShowMove(false);
                      setStatusNote("");
                    }
                  }}
                >
                  → {woStatusLabel(next, wo.serviceChannel)}
                </Button>
              ))}
            </div>
            <div>
              <Label className="text-xs">Note (optional)</Label>
              <Input
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Reason for status change…"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMove(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Overview Tab ─────────────────────────────────────────────────────────── */
function OverviewTab({
  wo, customers, staff, currency, onPatch,
}: {
  wo: WorkOrder;
  customers: any[];
  staff: any[];
  currency: string;
  onPatch: (data: any, msg?: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [diagnosisVal, setDiagnosisVal] = useState(wo.diagnosis ?? "");
  const [storageVal, setStorageVal] = useState(wo.storageLocation ?? "");
  const [depositPaidVal, setDepositPaidVal] = useState(String(wo.depositPaid ?? 0));

  const isTerminal = wo.status === "collected" || wo.status === "cancelled";

  const Field = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    ) : null;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Left column */}
      <div className="space-y-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" value={wo.customerName || wo.contactName} />
              <Field label="Phone" value={wo.customerPhone || wo.contactPhone} />
              <Field label="Email" value={wo.contactEmail} />
              <Field label="Customer ID" value={wo.customerId ? `#${wo.customerId}` : undefined} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="Description" value={wo.itemDescription} /></div>
              <Field label="Brand" value={wo.brand} />
              <Field label="Model" value={wo.model} />
              <Field label="Serial / IMEI" value={wo.serialNumber || wo.imei} />
              <Field label="Colour" value={wo.colour} />
              <Field label="Asset Tag" value={wo.assetTag} />
              <Field label="Condition received" value={wo.conditionReceived} />
              {wo.accessoriesReceived && (
                <div className="col-span-2"><Field label="Accessories" value={wo.accessoriesReceived} /></div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Problem Reported</p>
            <p className="text-sm whitespace-pre-wrap">{wo.problemDescription}</p>
          </CardContent>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-5">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Service</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Service type" value={wo.serviceType} />
              <Field label="Channel" value={wo.serviceChannel?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} />
              <Field label="Priority" value={wo.priority?.replace(/\b\w/g, (c) => c.toUpperCase())} />
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">
                  Assigned technician{(wo.assignedStaffIds?.length ?? 0) > 1 ? "s" : ""}
                </p>
                {!isTerminal ? (
                  <div className="border border-input rounded-md bg-background max-h-32 overflow-y-auto divide-y divide-border">
                    {staff.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No staff members.</p>
                    )}
                    {staff.map((s: any) => {
                      const checked = (wo.assignedStaffIds ?? []).includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="h-3.5 w-3.5 accent-primary shrink-0"
                            onChange={() => {
                              const ids = wo.assignedStaffIds ?? [];
                              const next = checked
                                ? ids.filter((x: number) => x !== s.id)
                                : [...ids, s.id];
                              onPatch({ assignedStaffIds: next }, "Assignment updated");
                            }}
                          />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm font-medium">
                    {wo.assignedStaffNames?.join(", ") || wo.assignedStaffName || "Unassigned"}
                  </p>
                )}
                {(wo.assignedStaffIds?.length > 0 || wo.assignedStaffId != null) && wo.assignmentStatus && (
                  <p
                    className={`text-xs mt-1 font-medium ${
                      wo.assignmentStatus === "accepted"
                        ? "text-green-600"
                        : wo.assignmentStatus === "declined"
                          ? "text-red-600"
                          : "text-amber-600"
                    }`}
                  >
                    {wo.assignmentStatus === "accepted"
                      ? "Accepted by technician"
                      : wo.assignmentStatus === "declined"
                        ? `Declined by technician${wo.declineReason ? ` — ${wo.declineReason}` : ""}`
                        : "Awaiting technician response"}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Promised date" value={fmtDate(wo.promisedDate)} />
              <Field label="Appointment" value={fmtDateTime(wo.appointmentDate)} />
              <div>
                <p className="text-xs text-muted-foreground">Storage location</p>
                {editing === "storage" ? (
                  <div className="flex gap-2 mt-1">
                    <Input value={storageVal} onChange={(e) => setStorageVal(e.target.value)} className="h-7 text-sm flex-1" />
                    <Button size="sm" className="h-7 w-7 p-0" onClick={() => { onPatch({ storageLocation: storageVal }, "Location updated"); setEditing(null); }}><Check className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium">{wo.storageLocation || "—"}</p>
                    {!isTerminal && <button className="text-muted-foreground hover:text-foreground" onClick={() => { setStorageVal(wo.storageLocation ?? ""); setEditing("storage"); }}><Pencil className="h-3 w-3" /></button>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial Summary</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(wo.subtotal, currency)}</span></div>
              {(wo.discountAmount ?? 0) > 0 && (
                <div className="flex justify-between text-rose-500"><span>Discount</span><span>-{formatCurrency(wo.discountAmount ?? 0, currency)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(wo.tax, currency)}</span></div>
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-1.5"><span>Total</span><span>{formatCurrency(wo.total, currency)}</span></div>
              {(wo.depositRequired ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Deposit required</span><span>{formatCurrency(wo.depositRequired ?? 0, currency)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposit paid</span>
                    {editing === "deposit" ? (
                      <div className="flex gap-2">
                        <Input type="number" min={0} step="0.01" value={depositPaidVal} onChange={(e) => setDepositPaidVal(e.target.value)} className="h-7 w-24 text-sm text-right" />
                        <Button size="sm" className="h-7 w-7 p-0" onClick={() => { onPatch({ depositPaid: Number(depositPaidVal) || 0 }, "Deposit updated"); setEditing(null); }}><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span>{formatCurrency(wo.depositPaid ?? 0, currency)}</span>
                        {!isTerminal && <button className="text-muted-foreground hover:text-foreground" onClick={() => { setDepositPaidVal(String(wo.depositPaid ?? 0)); setEditing("deposit"); }}><Pencil className="h-3 w-3" /></button>}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Diagnosis */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Technician's Diagnosis</p>
            {!isTerminal ? (
              <>
                <Textarea
                  value={diagnosisVal}
                  onChange={(e) => setDiagnosisVal(e.target.value)}
                  onBlur={() => { if (diagnosisVal !== (wo.diagnosis ?? "")) onPatch({ diagnosis: diagnosisVal }); }}
                  placeholder="Record findings after inspection…"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Auto-saved on blur</p>
              </>
            ) : (
              <p className="text-sm whitespace-pre-wrap">{wo.diagnosis || "No diagnosis recorded."}</p>
            )}
          </CardContent>
        </Card>

        {wo.notes && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="text-sm whitespace-pre-wrap">{wo.notes}</p>
            </CardContent>
          </Card>
        )}

        <ProofOfWorkCard wo={wo} />
      </div>
    </div>
  );
}

/* ── Proof of Work (FSM technician photos + customer sign-off) ────────────── */
function ProofOfWorkCard({ wo }: { wo: WorkOrder }) {
  const { data: photos } = useWorkOrderPhotos(wo.id);
  const hasPhotos = (photos?.length ?? 0) > 0;
  const hasSignature = !!wo.completionSignature;
  if (!hasPhotos && !hasSignature) return null;
  return (
    <Card data-testid="proof-of-work-card">
      <CardContent className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proof of Work (from technician)
        </p>
        {hasPhotos && (
          <div className="flex flex-wrap gap-2">
            {photos!.map((p) => (
              <img
                key={p.id}
                src={p.data}
                alt={p.caption ?? `Job photo by ${p.staffName ?? "technician"}`}
                title={p.caption ?? p.staffName ?? undefined}
                className="h-24 w-24 rounded-md object-cover border"
                data-testid={`job-photo-${p.id}`}
              />
            ))}
          </div>
        )}
        {hasSignature && (
          <div className="space-y-1">
            <img
              src={wo.completionSignature!}
              alt="Customer sign-off signature"
              className="h-24 rounded-md border bg-white"
              data-testid="completion-signature"
            />
            <p className="text-xs text-muted-foreground">
              Signed by {wo.completionSignedBy ?? "customer"}
              {wo.completionSignedAt ? ` · ${new Date(wo.completionSignedAt).toLocaleString()}` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Items Tab ───────────────────────────────────────────────────────────── */
function ItemsTab({
  wo, products, currency, onPatch,
}: {
  wo: WorkOrder;
  products: any[];
  currency: string;
  onPatch: (data: any, msg?: string) => void;
}) {
  const [productSearch, setProductSearch] = useState("");
  const [laborDesc, setLaborDesc] = useState("");
  const [laborPrice, setLaborPrice] = useState("");
  const [feeDesc, setFeeDesc] = useState("");
  const [feePrice, setFeePrice] = useState("");
  const { toast } = useToast();
  const isTerminal = wo.status === "collected" || wo.status === "cancelled";

  const productMatches = productSearch.trim().length > 0
    ? (products ?? []).filter((p: any) => !p.archivedAt).filter((p: any) =>
        p.name?.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku?.toLowerCase?.().includes(productSearch.toLowerCase()) ||
        p.barcode?.toLowerCase?.().includes(productSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  const addPart = (p: any) => {
    const items = [...wo.items, { type: "part" as const, productId: p.id, description: p.name, price: Number(p.price) || 0, quantity: 1, isTaxable: p.isTaxable !== false }];
    onPatch({ items }, "Part added");
    setProductSearch("");
  };
  const addLabor = () => {
    const price = Number(laborPrice);
    if (!laborDesc.trim() || !Number.isFinite(price) || price < 0) { toast({ title: "Enter description and price", variant: "destructive" }); return; }
    onPatch({ items: [...wo.items, { type: "labor" as const, description: laborDesc.trim(), price, quantity: 1, isTaxable: true }] });
    setLaborDesc(""); setLaborPrice("");
  };
  const addFee = () => {
    const price = Number(feePrice);
    if (!feeDesc.trim() || !Number.isFinite(price) || price < 0) { toast({ title: "Enter description and price", variant: "destructive" }); return; }
    onPatch({ items: [...wo.items, { type: "fee" as const, description: feeDesc.trim(), price, quantity: 1, isTaxable: true }] });
    setFeeDesc(""); setFeePrice("");
  };
  const removeItem = (idx: number) => onPatch({ items: wo.items.filter((_, i) => i !== idx) });
  const setQty = (idx: number, qty: number) => onPatch({ items: wo.items.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, qty) } : it) });

  return (
    <div className="space-y-4 max-w-2xl">
      {wo.items.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">No parts or labour added yet.</p>
      )}

      {wo.items.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2.5 font-medium text-xs text-muted-foreground uppercase">Type</th>
                <th className="text-left p-2.5 font-medium text-xs text-muted-foreground uppercase">Description</th>
                <th className="text-right p-2.5 font-medium text-xs text-muted-foreground uppercase">Price</th>
                <th className="text-right p-2.5 font-medium text-xs text-muted-foreground uppercase w-20">Qty</th>
                <th className="text-right p-2.5 font-medium text-xs text-muted-foreground uppercase">Total</th>
                {!isTerminal && <th className="w-8"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {wo.items.map((it, idx) => (
                <tr key={idx} className="hover:bg-muted/20">
                  <td className="p-2.5">
                    <Badge variant="outline" className="capitalize text-xs">{it.type}</Badge>
                  </td>
                  <td className="p-2.5 truncate max-w-xs">{it.description}</td>
                  <td className="p-2.5 text-right">{formatCurrency(it.price, currency)}</td>
                  <td className="p-2.5 text-right">
                    {!isTerminal ? (
                      <Input
                        type="number" min={1} value={it.quantity}
                        onChange={(e) => setQty(idx, Math.floor(Number(e.target.value) || 1))}
                        className="w-16 h-7 text-center ml-auto"
                      />
                    ) : (
                      <span>×{it.quantity}</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right font-medium">{formatCurrency(it.price * it.quantity, currency)}</td>
                  {!isTerminal && (
                    <td className="p-2.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="text-sm space-y-1 pt-2 border-t max-w-xs ml-auto">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(wo.subtotal, currency)}</span></div>
        {(wo.discountAmount ?? 0) > 0 && (
          <div className="flex justify-between text-rose-500"><span>Discount</span><span>-{formatCurrency(wo.discountAmount ?? 0, currency)}</span></div>
        )}
        <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(wo.tax, currency)}</span></div>
        <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(wo.total, currency)}</span></div>
      </div>

      {!isTerminal && (
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add lines</p>
          {/* Part from inventory */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search inventory for a part…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="pl-9" />
            {productMatches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
                {productMatches.map((p: any) => (
                  <button key={p.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex justify-between gap-2" onClick={() => addPart(p)}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatCurrency(Number(p.price) || 0, currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Labour */}
          <div className="flex gap-2">
            <Input placeholder="Labour description…" value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} className="flex-1" />
            <Input type="number" min={0} step="0.01" placeholder="Price" value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} className="w-28" />
            <Button variant="outline" onClick={addLabor}>+ Labour</Button>
          </div>
          {/* Fee */}
          <div className="flex gap-2">
            <Input placeholder="Fee description…" value={feeDesc} onChange={(e) => setFeeDesc(e.target.value)} className="flex-1" />
            <Input type="number" min={0} step="0.01" placeholder="Price" value={feePrice} onChange={(e) => setFeePrice(e.target.value)} className="w-28" />
            <Button variant="outline" onClick={addFee}>+ Fee</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Notes Tab ───────────────────────────────────────────────────────────── */
function NotesTab({ workOrderId }: { workOrderId: number }) {
  const { data: notes, isLoading } = useWorkOrderNotes(workOrderId);
  const addNote = useAddWorkOrderNote();
  const deleteNote = useDeleteWorkOrderNote();
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(true);

  const handleAdd = () => {
    if (!content.trim()) return;
    addNote.mutate(
      { workOrderId, content: content.trim(), isInternal },
      {
        onSuccess: () => { setContent(""); toast({ title: "Note added" }); },
        onError: (e: any) => toast({ title: "Could not add note", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a note…"
          rows={3}
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            <span className="text-muted-foreground">Internal (hidden from customer)</span>
          </label>
          <Button size="sm" onClick={handleAdd} disabled={addNote.isPending || !content.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add Note
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : (notes ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {(notes ?? []).map((n: WorkOrderNote) => (
            <div key={n.id} className={`rounded-lg border p-3 text-sm ${n.isInternal ? "bg-amber-500/5 border-amber-500/20" : "bg-sky-500/5 border-sky-500/20"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="whitespace-pre-wrap">{n.content}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {n.authorName ?? "Staff"} · {fmtDateTime(n.createdAt)}
                    {n.isInternal && <span className="ml-2 text-amber-600 font-medium">Internal</span>}
                  </p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500 shrink-0"
                  onClick={() => deleteNote.mutate({ workOrderId, noteId: n.id }, { onSuccess: () => toast({ title: "Note deleted" }) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Appointments Tab ────────────────────────────────────────────────────── */
function AppointmentsTab({ workOrderId, staff }: { workOrderId: number; staff: any[] }) {
  const { data: appts, isLoading } = useWorkOrderAppointments(workOrderId);
  const createAppt = useCreateWorkOrderAppointment();
  const updateAppt = useUpdateWorkOrderAppointment();
  const deleteAppt = useDeleteWorkOrderAppointment();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [apptType, setApptType] = useState("repair");
  const [staffId, setStaffId] = useState<number | "">("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [apptNotes, setApptNotes] = useState("");

  const handleCreate = () => {
    if (!startTime) { toast({ title: "Select a start time", variant: "destructive" }); return; }
    createAppt.mutate(
      { workOrderId, appointmentType: apptType, staffId: staffId ? Number(staffId) : undefined, startTime, endTime: endTime || undefined, notes: apptNotes || undefined },
      {
        onSuccess: () => {
          setShowAdd(false); setStartTime(""); setEndTime(""); setApptNotes("");
          toast({ title: "Appointment scheduled" });
        },
        onError: (e: any) => toast({ title: "Could not create appointment", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Button size="sm" onClick={() => setShowAdd(true)}>
        <Plus className="h-4 w-4 mr-1" /> Schedule Appointment
      </Button>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="font-medium text-sm">New Appointment</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <select className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm" value={apptType} onChange={(e) => setApptType(e.target.value)}>
                  {Object.entries(APPT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <Label>Technician</Label>
                <select className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Unassigned</option>
                  {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <Label>Start</Label>
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>End (optional)</Label>
                <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={apptNotes} onChange={(e) => setApptNotes(e.target.value)} rows={2} className="mt-1" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={createAppt.isPending}>Schedule</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading appointments…</p>
      ) : (appts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No appointments scheduled yet.</p>
      ) : (
        <div className="space-y-3">
          {(appts ?? []).map((a: WorkOrderAppointment) => (
            <div key={a.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{APPT_TYPE_LABEL[a.appointmentType] ?? a.appointmentType}</span>
                    <Badge variant="outline" className={`text-xs ${APPT_STATUS_STYLE[a.status] ?? ""}`}>{a.status}</Badge>
                  </div>
                  <p className="text-muted-foreground mt-1">{fmtDateTime(a.startTime)}{a.endTime ? ` → ${fmtDateTime(a.endTime)}` : ""}</p>
                  {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
                </div>
                <div className="flex gap-1">
                  {a.status === "scheduled" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => updateAppt.mutate({ workOrderId, appointmentId: a.id, status: "completed" }, { onSuccess: () => toast({ title: "Marked complete" }) })}>
                      <Check className="h-3 w-3 mr-1" /> Done
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500"
                    onClick={() => deleteAppt.mutate({ workOrderId, appointmentId: a.id }, { onSuccess: () => toast({ title: "Appointment removed" }) })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── History Tab ─────────────────────────────────────────────────────────── */
function HistoryTab({ workOrderId, serviceChannel }: { workOrderId: number; serviceChannel?: string | null }) {
  const { data: history, isLoading } = useWorkOrderHistory(workOrderId);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (!history?.length) return <p className="text-sm text-muted-foreground py-4">No history yet.</p>;

  return (
    <div className="max-w-xl space-y-3">
      <div className="relative pl-4 border-l-2 border-border space-y-4">
        {history.map((h) => (
          <div key={h.id} className="relative">
            <div className="absolute -left-[17px] top-0.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />
            <div className="text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {h.fromStatus && <span className="text-muted-foreground">{woStatusLabel(h.fromStatus, serviceChannel)}</span>}
                {h.fromStatus && <span className="text-muted-foreground">→</span>}
                <span className="font-semibold">{woStatusLabel(h.toStatus, serviceChannel)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {h.changedByName ?? "System"} · {fmtDateTime(h.createdAt)}
              </p>
              {h.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{h.note}"</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Job Card Tab ────────────────────────────────────────────────────────── */
function JobCardTab({ wo, currency, onPrint }: { wo: WorkOrder; currency: string; onPrint: () => void }) {
  return (
    <div className="max-w-lg space-y-4">
      <p className="text-sm text-muted-foreground">
        The job card is a printable document that includes all asset details, the customer's signature line, and a barcode for quick scanning.
      </p>
      <div className="rounded-lg border p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-muted-foreground">Work Order #</p><p className="font-semibold font-mono">{wo.workOrderNumber}</p></div>
          <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline" className={`text-xs ${STATUS_STYLES[wo.status as WorkOrderStatus]}`}>{woStatusLabel(wo.status, wo.serviceChannel)}</Badge></div>
          <div><p className="text-xs text-muted-foreground">Asset</p><p>{wo.itemDescription}</p></div>
          <div><p className="text-xs text-muted-foreground">Customer</p><p>{wo.customerName || wo.contactName || "Walk-in"}</p></div>
          {wo.brand && <div><p className="text-xs text-muted-foreground">Brand / Model</p><p>{wo.brand}{wo.model ? ` ${wo.model}` : ""}</p></div>}
          {wo.serialNumber && <div><p className="text-xs text-muted-foreground">Serial</p><p className="font-mono">{wo.serialNumber}</p></div>}
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={onPrint}>
          <Printer className="h-4 w-4 mr-2" /> Print / Save as PDF
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Opens in a new tab. Use your browser's Print function to print or save as PDF. Includes a Code128 barcode of the work order number.
      </p>
    </div>
  );
}
