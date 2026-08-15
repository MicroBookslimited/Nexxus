import { useState, useMemo, useEffect, useRef } from "react";
import { useGetSettings, useListStaff } from "@workspace/api-client-react";
import {
  useAssets,
  useAsset,
  useAssetSummary,
  useAssetCategories,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset,
  useAssignAsset,
  useReturnAsset,
  useLogAssetService,
  useTeams,
  type FixedAsset,
  type AssetInput,
  type AssetFilters,
  type AssetCondition,
  type AssetStatus,
} from "@/lib/assets-api";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Wrench, Search, Plus, Eye, Pencil, Trash2, Printer, ArrowRightLeft,
  Undo2, ClipboardCheck, Archive, ChevronsUpDown, Check, X, Package,
} from "lucide-react";
import {
  formatCurrency, fmtDate, fmtDateTime, toDateInput,
  CONDITION_LABEL, CONDITION_STYLES, STATUS_LABEL, STATUS_STYLES,
  SERVICE_STATE_STYLES, SERVICE_TYPE_LABEL, holderLabel,
  computeDepreciation, downscaleImageToDataUrl, printAssetTag,
} from "@/components/assets/asset-helpers";

type StaffRow = { id: number; name: string; role?: string; isTechnician?: boolean; isActive?: boolean };

const CONDITIONS: AssetCondition[] = ["good", "fair", "needs_repair", "out_of_service"];
const STATUSES: AssetStatus[] = ["in_store", "assigned", "in_repair", "retired", "lost"];

/* ─── Create / edit form state ─── */

type FormState = {
  assetTag: string;
  name: string;
  isTool: boolean;
  category: string;
  serialNumber: string;
  manufacturer: string;
  model: string;
  purchaseDate: string;
  purchaseCost: string;
  vendorName: string;
  warrantyExpiry: string;
  depreciationMethod: "straight_line" | "none";
  usefulLifeMonths: string;
  salvageValue: string;
  depreciationStartDate: string;
  condition: AssetCondition;
  locationName: string;
  serviceIntervalDays: string;
  lastServiceDate: string;
  nextServiceDue: string;
  notes: string;
  photoUrl: string | null;
};

const EMPTY_FORM: FormState = {
  assetTag: "",
  name: "",
  isTool: false,
  category: "",
  serialNumber: "",
  manufacturer: "",
  model: "",
  purchaseDate: "",
  purchaseCost: "",
  vendorName: "",
  warrantyExpiry: "",
  depreciationMethod: "straight_line",
  usefulLifeMonths: "",
  salvageValue: "",
  depreciationStartDate: "",
  condition: "good",
  locationName: "",
  serviceIntervalDays: "",
  lastServiceDate: "",
  nextServiceDue: "",
  notes: "",
  photoUrl: null,
};

function fromAsset(a: FixedAsset): FormState {
  return {
    assetTag: a.assetTag,
    name: a.name,
    isTool: a.isTool,
    category: a.category ?? "",
    serialNumber: a.serialNumber ?? "",
    manufacturer: a.manufacturer ?? "",
    model: a.model ?? "",
    purchaseDate: toDateInput(a.purchaseDate),
    purchaseCost: a.purchaseCost != null ? String(a.purchaseCost) : "",
    vendorName: a.vendorName ?? "",
    warrantyExpiry: toDateInput(a.warrantyExpiry),
    depreciationMethod: a.depreciationMethod,
    usefulLifeMonths: a.usefulLifeMonths != null ? String(a.usefulLifeMonths) : "",
    salvageValue: a.salvageValue != null ? String(a.salvageValue) : "",
    depreciationStartDate: toDateInput(a.depreciationStartDate),
    condition: a.condition,
    locationName: a.locationName ?? "",
    serviceIntervalDays: a.serviceIntervalDays != null ? String(a.serviceIntervalDays) : "",
    lastServiceDate: toDateInput(a.lastServiceDate),
    nextServiceDue: toDateInput(a.nextServiceDue),
    notes: a.notes ?? "",
    photoUrl: a.photoUrl,
  };
}

function num(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function AssetsPage() {
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const currency = settings?.currency || "JMD";

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [condition, setCondition] = useState("all");
  const [toolsOnly, setToolsOnly] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [includeRetired, setIncludeRetired] = useState(false);

  const filters: AssetFilters = useMemo(() => ({
    search: debouncedSearch || undefined,
    category: category === "all" ? undefined : category,
    status: status === "all" ? undefined : status,
    condition: condition === "all" ? undefined : condition,
    isTool: toolsOnly ? true : undefined,
    dueWithinDays: dueOnly ? 30 : undefined,
    includeRetired: includeRetired || undefined,
  }), [debouncedSearch, category, status, condition, toolsOnly, dueOnly, includeRetired]);

  const { data: assets = [], isLoading } = useAssets(filters);
  const { data: summary } = useAssetSummary();
  const { data: categories = [] } = useAssetCategories();

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [assignFor, setAssignFor] = useState<FixedAsset | null>(null);
  const [returnFor, setReturnFor] = useState<FixedAsset | null>(null);
  const [serviceFor, setServiceFor] = useState<FixedAsset | null>(null);
  const [deleteFor, setDeleteFor] = useState<FixedAsset | null>(null);

  const createMutation = useCreateAsset();
  const updateMutation = useUpdateAsset();
  const deleteMutation = useDeleteAsset();

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: FixedAsset) {
    setForm(fromAsset(a));
    setEditing(a);
    setFormOpen(true);
  }

  function buildPayload(): AssetInput | null {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return null;
    }
    return {
      assetTag: form.assetTag.trim() || undefined,
      name: form.name.trim(),
      isTool: form.isTool,
      category: form.category.trim() || null,
      serialNumber: form.serialNumber.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      photoUrl: form.photoUrl,
      purchaseDate: form.purchaseDate || null,
      purchaseCost: num(form.purchaseCost) ?? 0,
      vendorName: form.vendorName.trim() || null,
      warrantyExpiry: form.warrantyExpiry || null,
      depreciationMethod: form.depreciationMethod,
      usefulLifeMonths: num(form.usefulLifeMonths) ?? null,
      salvageValue: num(form.salvageValue) ?? 0,
      depreciationStartDate: form.depreciationStartDate || null,
      condition: form.condition,
      locationName: form.locationName.trim() || null,
      serviceIntervalDays: num(form.serviceIntervalDays) ?? null,
      lastServiceDate: form.lastServiceDate || null,
      nextServiceDue: form.nextServiceDue || null,
      notes: form.notes.trim() || null,
    };
  }

  function handleSubmit() {
    const payload = buildPayload();
    if (!payload) return;
    if (editing) {
      updateMutation.mutate(
        { id: editing.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Asset updated" });
            setFormOpen(false);
            setEditing(null);
          },
          onError: (e) => toast({ title: "Could not update asset", description: e.message, variant: "destructive" }),
        },
      );
    } else {
      createMutation.mutate(payload, {
        onSuccess: (a) => {
          toast({ title: "Asset added", description: `${a.assetTag} — ${a.name}` });
          setFormOpen(false);
        },
        onError: (e) => toast({ title: "Could not add asset", description: e.message, variant: "destructive" }),
      });
    }
  }

  function handleRetire(a: FixedAsset) {
    updateMutation.mutate(
      { id: a.id, data: { status: "retired" } },
      {
        onSuccess: () => toast({ title: "Asset retired", description: a.name }),
        onError: (e) => toast({ title: "Could not retire asset", description: e.message, variant: "destructive" }),
      },
    );
  }

  function handleDelete(a: FixedAsset) {
    deleteMutation.mutate(a.id, {
      onSuccess: () => {
        toast({ title: "Asset deleted", description: a.name });
        setDeleteFor(null);
      },
      // Server returns 409 with a reason (history exists) — surface it verbatim.
      onError: (e) => toast({ title: "Could not delete asset", description: e.message, variant: "destructive" }),
    });
  }

  async function handlePrintTag(a: FixedAsset) {
    try {
      await printAssetTag(a);
    } catch (e) {
      toast({ title: "Could not print tag", description: (e as Error).message, variant: "destructive" });
    }
  }

  // Live depreciation preview for the form.
  const formDepreciation = useMemo(() => computeDepreciation({
    purchaseCost: num(form.purchaseCost) ?? 0,
    salvageValue: num(form.salvageValue) ?? 0,
    usefulLifeMonths: num(form.usefulLifeMonths) ?? null,
    depreciationMethod: form.depreciationMethod,
    depreciationStartDate: form.depreciationStartDate || null,
    purchaseDate: form.purchaseDate || null,
  }), [form.purchaseCost, form.salvageValue, form.usefulLifeMonths, form.depreciationMethod, form.depreciationStartDate, form.purchaseDate]);

  // Route-level module gate: nav is already hidden, but block direct URL access too.
  if (settings && settings.fixed_assets_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Fixed Assets module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules.</p>
      </div>
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wrench className="h-6 w-6 text-sky-500" />
          <h1 className="text-xl font-semibold">Assets &amp; Tools</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Asset
        </Button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <SummaryTile label="Total Assets" value={summary ? String(summary.total) : "—"} />
        <SummaryTile label="Tools" value={summary ? String(summary.tools) : "—"} />
        <SummaryTile label="Assigned" value={summary ? String(summary.assigned) : "—"} />
        <SummaryTile
          label="Due for Service"
          value={summary ? String(summary.dueForService) : "—"}
          accent={summary && summary.dueForService > 0 ? "text-amber-600" : undefined}
        />
        <SummaryTile
          label="Needs Repair"
          value={summary ? String(summary.needsRepair) : "—"}
          accent={summary && summary.needsRepair > 0 ? "text-rose-600" : undefined}
        />
        <SummaryTile label="Total Cost" value={summary ? formatCurrency(summary.totalCost, currency) : "—"} />
        <SummaryTile label="Book Value" value={summary ? formatCurrency(summary.totalBookValue, currency) : "—"} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tag, name, serial, manufacturer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={condition} onValueChange={setCondition}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Condition" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any condition</SelectItem>
            {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
        <FilterToggle active={toolsOnly} onClick={() => setToolsOnly((v) => !v)}>Tools only</FilterToggle>
        <FilterToggle active={dueOnly} onClick={() => setDueOnly((v) => !v)}>Due for service</FilterToggle>
        <FilterToggle active={includeRetired} onClick={() => setIncludeRetired((v) => !v)}>Incl. retired</FilterToggle>
      </div>

      {/* Asset table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No assets found. Click "Add Asset" to register one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Asset</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                    <th className="px-4 py-2.5 font-medium">Condition</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Held by</th>
                    <th className="px-4 py-2.5 font-medium">Next service</th>
                    <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                    <th className="px-4 py-2.5 font-medium text-right">Book value</th>
                    <th className="px-4 py-2.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => {
                    const held = holderLabel(a);
                    return (
                      <tr key={a.id} className="border-b border-border/50 hover:bg-muted/40">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Thumb url={a.photoUrl} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs text-muted-foreground">{a.assetTag}</span>
                                {a.isTool && (
                                  <Badge variant="outline" className="bg-indigo-500/15 text-indigo-600 border-indigo-500/30 text-[10px] px-1 py-0">
                                    Tool
                                  </Badge>
                                )}
                              </div>
                              <div className="font-medium truncate max-w-[220px]">{a.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">{a.category || "—"}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={CONDITION_STYLES[a.condition]}>
                            {CONDITION_LABEL[a.condition]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={STATUS_STYLES[a.status]}>
                            {STATUS_LABEL[a.status]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div>{held.text}</div>
                          {held.job && <div className="text-xs text-muted-foreground font-mono">{held.job}</div>}
                        </td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${SERVICE_STATE_STYLES[a.serviceState]}`}>
                          {a.nextServiceDue ? fmtDate(a.nextServiceDue) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatCurrency(a.purchaseCost, currency)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">{formatCurrency(a.depreciation.bookValue, currency)}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(a.id)} title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          {a.currentAssignment ? (
                            <Button size="sm" variant="ghost" onClick={() => setReturnFor(a)} title="Return">
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            a.status !== "retired" && (
                              <Button size="sm" variant="ghost" onClick={() => setAssignFor(a)} title="Assign">
                                <ArrowRightLeft className="h-4 w-4" />
                              </Button>
                            )
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setServiceFor(a)} title="Log service">
                            <ClipboardCheck className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handlePrintTag(a)} title="Print tag">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-500 hover:text-rose-600"
                            onClick={() => setDeleteFor(a)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <AssetFormDialog
        open={formOpen}
        editing={editing}
        form={form}
        setF={setF}
        setForm={setForm}
        categories={categories}
        currency={currency}
        depreciation={formDepreciation}
        saving={saving}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        onError={(msg) => toast({ title: "Photo problem", description: msg, variant: "destructive" })}
      />

      {/* Detail drawer */}
      <AssetDetailDialog
        id={detailId}
        currency={currency}
        onClose={() => setDetailId(null)}
      />

      {/* Assign dialog */}
      {assignFor && (
        <AssignDialog
          asset={assignFor}
          onClose={() => setAssignFor(null)}
          onDone={() => setAssignFor(null)}
        />
      )}

      {/* Return dialog */}
      {returnFor && (
        <ReturnDialog
          asset={returnFor}
          onClose={() => setReturnFor(null)}
          onDone={() => setReturnFor(null)}
        />
      )}

      {/* Log service dialog */}
      {serviceFor && (
        <ServiceDialog
          asset={serviceFor}
          currency={currency}
          onClose={() => setServiceFor(null)}
          onDone={() => setServiceFor(null)}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete asset?</DialogTitle>
            <DialogDescription>
              {deleteFor?.name} ({deleteFor?.assetTag}) will be permanently removed. Assets with custody or
              service history can't be deleted — retire them instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {deleteFor && deleteFor.status !== "retired" && (
              <Button variant="outline" onClick={() => { handleRetire(deleteFor); setDeleteFor(null); }}>
                <Archive className="h-4 w-4 mr-1" /> Retire instead
              </Button>
            )}
            <Button variant="outline" onClick={() => setDeleteFor(null)}>Keep</Button>
            <Button
              variant="destructive"
              onClick={() => deleteFor && handleDelete(deleteFor)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Small presentational pieces ─── */

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold mt-0.5 ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button size="sm" variant={active ? "default" : "outline"} onClick={onClick}>
      {children}
    </Button>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
        <Package className="h-4 w-4" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-9 w-9 rounded object-cover bg-muted flex-shrink-0" />;
}

/* ─── Category combobox with free entry ─── */

function CategoryCombobox({ value, categories, onChange }: {
  value: string;
  categories: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          {value || <span className="text-muted-foreground">Select or type a category…</span>}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or add category…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {query.trim() ? (
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                  onClick={() => { onChange(query.trim()); setOpen(false); setQuery(""); }}
                >
                  Add "{query.trim()}"
                </button>
              ) : "No categories yet."}
            </CommandEmpty>
            <CommandGroup>
              {categories.map((c) => (
                <CommandItem key={c} value={c} onSelect={() => { onChange(c); setOpen(false); setQuery(""); }}>
                  <Check className={`h-4 w-4 mr-2 ${value === c ? "opacity-100" : "opacity-0"}`} />
                  {c}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Create / edit dialog ─── */

function AssetFormDialog({
  open, editing, form, setF, setForm, categories, currency, depreciation, saving, onClose, onSubmit, onError,
}: {
  open: boolean;
  editing: FixedAsset | null;
  form: FormState;
  setF: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  categories: string[];
  currency: string;
  depreciation: ReturnType<typeof computeDepreciation>;
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onError: (msg: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setProcessing(true);
    try {
      const dataUrl = await downscaleImageToDataUrl(file);
      if (dataUrl.length > 400000) {
        onError("That image is still too large after resizing. Try a smaller photo.");
      } else {
        setForm((f) => ({ ...f, photoUrl: dataUrl }));
      }
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Asset" : "Add Asset"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update this asset's details." : "Register a fixed asset or tool in the register."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Asset Tag</Label>
              <Input
                value={form.assetTag}
                onChange={(e) => setF("assetTag", e.target.value)}
                placeholder="Auto-generated when blank"
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to auto-generate a unique tag.</p>
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="e.g. DeWalt Impact Drill" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.isTool} onCheckedChange={(v) => setF("isTool", v)} id="isTool" />
            <Label htmlFor="isTool" className="cursor-pointer">This is a tool (can be signed out to jobs)</Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <CategoryCombobox value={form.category} categories={categories} onChange={(v) => setF("category", v)} />
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={form.condition} onValueChange={(v) => setF("condition", v as AssetCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_LABEL[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Serial Number</Label>
              <Input value={form.serialNumber} onChange={(e) => setF("serialNumber", e.target.value)} />
            </div>
            <div>
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={(e) => setF("manufacturer", e.target.value)} />
            </div>
            <div>
              <Label>Model</Label>
              <Input value={form.model} onChange={(e) => setF("model", e.target.value)} />
            </div>
          </div>

          {/* Purchase */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Purchase Date</Label>
              <Input type="date" value={form.purchaseDate} onChange={(e) => setF("purchaseDate", e.target.value)} />
            </div>
            <div>
              <Label>Purchase Cost ({currency})</Label>
              <Input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={(e) => setF("purchaseCost", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Vendor Name</Label>
              <Input value={form.vendorName} onChange={(e) => setF("vendorName", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Warranty Expiry</Label>
              <Input type="date" value={form.warrantyExpiry} onChange={(e) => setF("warrantyExpiry", e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={form.locationName} onChange={(e) => setF("locationName", e.target.value)} placeholder="e.g. Main store, Van 2" />
            </div>
          </div>

          {/* Depreciation */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="text-sm font-medium">Depreciation</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Method</Label>
                <Select value={form.depreciationMethod} onValueChange={(v) => setF("depreciationMethod", v as "straight_line" | "none")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight line</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Useful Life (months)</Label>
                <Input type="number" min="0" step="1" value={form.usefulLifeMonths} onChange={(e) => setF("usefulLifeMonths", e.target.value)} disabled={form.depreciationMethod === "none"} />
              </div>
              <div>
                <Label>Salvage Value ({currency})</Label>
                <Input type="number" min="0" step="0.01" value={form.salvageValue} onChange={(e) => setF("salvageValue", e.target.value)} disabled={form.depreciationMethod === "none"} />
              </div>
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.depreciationStartDate} onChange={(e) => setF("depreciationStartDate", e.target.value)} disabled={form.depreciationMethod === "none"} />
                <p className="text-xs text-muted-foreground mt-1">Defaults to the purchase date.</p>
              </div>
            </div>
            {form.depreciationMethod === "straight_line" && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm bg-muted/40 rounded p-2">
                <span>Monthly: <strong>{formatCurrency(depreciation.monthlyDepreciation, currency)}</strong></span>
                <span>Book value today: <strong>{formatCurrency(depreciation.bookValue, currency)}</strong></span>
                <span className="text-muted-foreground">{depreciation.monthsElapsed} mo elapsed · {depreciation.monthsRemaining} mo left</span>
              </div>
            )}
          </div>

          {/* Service schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Service Interval (days)</Label>
              <Input type="number" min="0" step="1" value={form.serviceIntervalDays} onChange={(e) => setF("serviceIntervalDays", e.target.value)} />
            </div>
            <div>
              <Label>Last Service Date</Label>
              <Input type="date" value={form.lastServiceDate} onChange={(e) => setF("lastServiceDate", e.target.value)} />
            </div>
            <div>
              <Label>Next Service Due</Label>
              <Input type="date" value={form.nextServiceDue} onChange={(e) => setF("nextServiceDue", e.target.value)} />
            </div>
          </div>

          {/* Photo */}
          <div>
            <Label>Photo</Label>
            <div className="flex items-center gap-3 mt-1">
              {form.photoUrl ? (
                <div className="relative">
                  <img src={form.photoUrl} alt="" className="h-20 w-20 rounded object-cover border border-border" />
                  <button
                    type="button"
                    onClick={() => setF("photoUrl", null)}
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-rose-500 text-white flex items-center justify-center"
                    title="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-20 w-20 rounded border border-dashed border-border flex items-center justify-center text-muted-foreground">
                  <Package className="h-6 w-6" />
                </div>
              )}
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePhoto(e.target.files?.[0])}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={processing}>
                  {processing ? "Processing…" : form.photoUrl ? "Replace photo" : "Upload photo"}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">Resized to 800px / JPEG before upload.</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setF("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save Changes" : "Add Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Detail dialog ─── */

function AssetDetailDialog({ id, currency, onClose }: { id: number | null; currency: string; onClose: () => void }) {
  const { data: asset, isLoading } = useAsset(id);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !asset ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading…</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{asset.assetTag}</span>
                {asset.name}
                {asset.isTool && (
                  <Badge variant="outline" className="bg-indigo-500/15 text-indigo-600 border-indigo-500/30">Tool</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className={STATUS_STYLES[asset.status]}>{STATUS_LABEL[asset.status]}</Badge>
                <Badge variant="outline" className={CONDITION_STYLES[asset.condition]}>{CONDITION_LABEL[asset.condition]}</Badge>
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-4">
              {asset.photoUrl && (
                <img src={asset.photoUrl} alt="" className="h-28 w-28 rounded object-cover border border-border flex-shrink-0" />
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm flex-1">
                <div className="text-muted-foreground">Category</div><div>{asset.category || "—"}</div>
                <div className="text-muted-foreground">Serial</div><div>{asset.serialNumber || "—"}</div>
                <div className="text-muted-foreground">Manufacturer</div><div>{asset.manufacturer || "—"}</div>
                <div className="text-muted-foreground">Model</div><div>{asset.model || "—"}</div>
                <div className="text-muted-foreground">Location</div><div>{asset.locationName || "—"}</div>
                <div className="text-muted-foreground">Vendor</div><div>{asset.vendorName || "—"}</div>
              </div>
            </div>

            {/* Financials */}
            <div className="rounded-md border border-border p-3">
              <div className="text-sm font-medium mb-2">Financials &amp; depreciation</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                <div className="text-muted-foreground">Purchase cost</div><div className="sm:col-span-2">{formatCurrency(asset.purchaseCost, currency)}</div>
                <div className="text-muted-foreground">Purchased</div><div className="sm:col-span-2">{fmtDate(asset.purchaseDate)}</div>
                <div className="text-muted-foreground">Warranty</div><div className="sm:col-span-2">{fmtDate(asset.warrantyExpiry)}</div>
                <div className="text-muted-foreground">Method</div><div className="sm:col-span-2">{asset.depreciationMethod === "straight_line" ? "Straight line" : "None"}</div>
                <div className="text-muted-foreground">Monthly</div><div className="sm:col-span-2">{formatCurrency(asset.depreciation.monthlyDepreciation, currency)}</div>
                <div className="text-muted-foreground">Accumulated</div><div className="sm:col-span-2">{formatCurrency(asset.depreciation.accumulatedDepreciation, currency)}</div>
                <div className="text-muted-foreground">Book value</div><div className="sm:col-span-2 font-medium">{formatCurrency(asset.depreciation.bookValue, currency)}</div>
                <div className="text-muted-foreground">Life used</div><div className="sm:col-span-2">{asset.depreciation.monthsElapsed} / {(asset.usefulLifeMonths ?? 0)} months</div>
              </div>
            </div>

            {/* Assignment history */}
            <div>
              <div className="text-sm font-medium mb-2">Custody history</div>
              {asset.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No custody records yet.</p>
              ) : (
                <div className="space-y-2">
                  {asset.assignments.map((r) => {
                    const who = r.assigneeType === "team" ? r.teamName : r.staffName;
                    return (
                      <div key={r.id} className="rounded border border-border/60 p-2 text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-medium">
                            {who || (r.assigneeType === "team" ? "Team" : "Technician")}
                            {r.workOrderNumber && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.workOrderNumber}</span>}
                          </span>
                          <Badge variant="outline" className={r.status === "active"
                            ? "bg-violet-500/15 text-violet-600 border-violet-500/30"
                            : "bg-muted text-muted-foreground border-border"}>
                            {r.status === "active" ? "Out" : "Returned"}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Out {fmtDateTime(r.assignedAt)}{r.assignedByName ? ` by ${r.assignedByName}` : ""}
                          {r.conditionOut ? ` · condition ${r.conditionOut}` : ""}
                        </div>
                        {r.status === "returned" && (
                          <div className="text-xs text-muted-foreground">
                            Returned {fmtDateTime(r.returnedAt)}{r.returnedToName ? ` to ${r.returnedToName}` : ""}
                            {r.conditionIn ? ` · condition ${r.conditionIn}` : ""}
                          </div>
                        )}
                        {(r.notes || r.returnNotes) && (
                          <div className="text-xs mt-1">{r.notes || r.returnNotes}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Service log */}
            <div>
              <div className="text-sm font-medium mb-2">Service log</div>
              {asset.serviceRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">No service records yet.</p>
              ) : (
                <div className="space-y-2">
                  {asset.serviceRecords.map((s) => (
                    <div key={s.id} className="rounded border border-border/60 p-2 text-sm">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium">{SERVICE_TYPE_LABEL[s.serviceType] ?? s.serviceType}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(s.performedAt)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {s.performedBy ? `By ${s.performedBy} · ` : ""}
                        {formatCurrency(s.cost, currency)}
                        {s.nextDueDate ? ` · next due ${fmtDate(s.nextDueDate)}` : ""}
                      </div>
                      {s.notes && <div className="text-xs mt-1">{s.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {asset.notes && (
              <div>
                <div className="text-sm font-medium mb-1">Notes</div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}

            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Assign dialog ─── */

function AssignDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { data: staffRaw = [] } = useListStaff();
  const { data: teams = [] } = useTeams();
  const assignMutation = useAssignAsset();

  const technicians = (staffRaw as StaffRow[]).filter((s) => s.isActive !== false);
  const [mode, setMode] = useState<"staff" | "team">("staff");
  const [staffId, setStaffId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [conditionOut, setConditionOut] = useState<AssetCondition>(asset.condition);
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");

  function submit() {
    if (mode === "staff" && !staffId) { toast({ title: "Pick a technician", variant: "destructive" }); return; }
    if (mode === "team" && !teamId) { toast({ title: "Pick a team", variant: "destructive" }); return; }
    assignMutation.mutate({
      id: asset.id,
      data: {
        assigneeType: mode,
        staffId: mode === "staff" ? Number(staffId) : undefined,
        teamId: mode === "team" ? Number(teamId) : undefined,
        conditionOut,
        expectedReturnDate: expected || null,
        notes: notes.trim() || undefined,
      },
    }, {
      onSuccess: () => { toast({ title: "Asset assigned" }); onDone(); },
      onError: (e) => toast({ title: "Could not assign", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {asset.name}</DialogTitle>
          <DialogDescription>Hand this asset to a technician or a team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={mode === "staff" ? "default" : "outline"} onClick={() => setMode("staff")}>Technician</Button>
            <Button size="sm" variant={mode === "team" ? "default" : "outline"} onClick={() => setMode("team")}>Team</Button>
          </div>
          {mode === "staff" ? (
            <div>
              <Label>Technician</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue placeholder="Select technician" /></SelectTrigger>
                <SelectContent>
                  {technicians.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {teams.filter((t) => t.isActive).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Condition out</Label>
              <Select value={conditionOut} onValueChange={(v) => setConditionOut(v as AssetCondition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_LABEL[c]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected return</Label>
              <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={assignMutation.isPending}>
            {assignMutation.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Return dialog ─── */

function ReturnDialog({ asset, onClose, onDone }: { asset: FixedAsset; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const returnMutation = useReturnAsset();
  const [conditionIn, setConditionIn] = useState<AssetCondition>(asset.condition);
  const [returnNotes, setReturnNotes] = useState("");

  const held = holderLabel(asset);

  function submit() {
    returnMutation.mutate({
      id: asset.id,
      data: { conditionIn, returnNotes: returnNotes.trim() || undefined },
    }, {
      onSuccess: () => { toast({ title: "Asset returned" }); onDone(); },
      onError: (e) => toast({ title: "Could not return", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Return {asset.name}</DialogTitle>
          <DialogDescription>Currently held by {held.text}{held.job ? ` (${held.job})` : ""}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Condition on return</Label>
            <Select value={conditionIn} onValueChange={(v) => setConditionIn(v as AssetCondition)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} placeholder="Any damage, missing parts…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={returnMutation.isPending}>
            {returnMutation.isPending ? "Returning…" : "Return to Store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Log service dialog ─── */

function ServiceDialog({ asset, currency, onClose, onDone }: { asset: FixedAsset; currency: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { staff: sessionStaff } = useStaff();
  const logMutation = useLogAssetService();
  const [serviceType, setServiceType] = useState<"service" | "calibration" | "repair" | "inspection">("service");
  const [performedAt, setPerformedAt] = useState(toDateInput(new Date().toISOString()));
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [condition, setCondition] = useState<AssetCondition | "unchanged">("unchanged");

  function submit() {
    logMutation.mutate({
      id: asset.id,
      data: {
        serviceType,
        performedAt: performedAt || null,
        performedBy: sessionStaff?.name || undefined,
        cost: cost.trim() ? Number(cost) : undefined,
        notes: notes.trim() || undefined,
        nextDueDate: nextDueDate || null,
        condition: condition === "unchanged" ? undefined : condition,
      },
    }, {
      onSuccess: () => { toast({ title: "Service logged" }); onDone(); },
      onError: (e) => toast({ title: "Could not log service", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log service — {asset.name}</DialogTitle>
          <DialogDescription>Record a service, calibration, repair or inspection.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={serviceType} onValueChange={(v) => setServiceType(v as typeof serviceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="calibration">Calibration</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cost ({currency})</Label>
              <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Next due</Label>
              <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Condition after</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as AssetCondition | "unchanged")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unchanged">Leave unchanged</SelectItem>
                {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={logMutation.isPending}>
            {logMutation.isPending ? "Saving…" : "Log service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
