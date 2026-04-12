import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListHardwareDevices, useCreateHardwareDevice, useUpdateHardwareDevice, useDeleteHardwareDevice,
  useListDriverLinks, useCreateDriverLink, useUpdateDriverLink, useDeleteDriverLink,
  type HardwareDevice, type DriverLink, type DeviceType, type DriverPlatform,
  type CreateHardwareDeviceInput, type CreateDriverLinkInput,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Cpu, Plus, Pencil, Trash2, Download, Search, ExternalLink,
  Printer, ScanLine, Archive, CreditCard, Monitor, Tag, Tablet, Tv2, HardDrive,
  ShoppingBag, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_TYPES: { value: DeviceType; label: string; icon: React.ElementType; color: string }[] = [
  { value: "printer",          label: "Receipt Printer",    icon: Printer,    color: "text-blue-400" },
  { value: "barcode_scanner",  label: "Barcode Scanner",    icon: ScanLine,   color: "text-green-400" },
  { value: "cash_drawer",      label: "Cash Drawer",        icon: Archive,    color: "text-yellow-400" },
  { value: "card_reader",      label: "Card Reader",        icon: CreditCard, color: "text-purple-400" },
  { value: "customer_display", label: "Customer Display",   icon: Monitor,    color: "text-cyan-400" },
  { value: "label_printer",    label: "Label Printer",      icon: Tag,        color: "text-orange-400" },
  { value: "tablet",           label: "Tablet / PC",        icon: Tablet,     color: "text-indigo-400" },
  { value: "kds",              label: "Kitchen Display",    icon: Tv2,        color: "text-red-400" },
  { value: "other",            label: "Other",              icon: HardDrive,  color: "text-slate-400" },
];

const PLATFORMS: { value: DriverPlatform; label: string; color: string }[] = [
  { value: "all",     label: "All Platforms", color: "bg-slate-500/20 text-slate-300" },
  { value: "windows", label: "Windows",       color: "bg-blue-500/20 text-blue-300" },
  { value: "macos",   label: "macOS",         color: "bg-slate-500/20 text-slate-300" },
  { value: "linux",   label: "Linux",         color: "bg-orange-500/20 text-orange-300" },
  { value: "android", label: "Android",       color: "bg-green-500/20 text-green-300" },
  { value: "ios",     label: "iOS",           color: "bg-slate-500/20 text-slate-300" },
];

const CONDITIONS: { value: string; label: string; color: string }[] = [
  { value: "new",          label: "New",          color: "bg-emerald-500/20 text-emerald-400" },
  { value: "good",         label: "Good",         color: "bg-blue-500/20 text-blue-400" },
  { value: "fair",         label: "Fair",         color: "bg-yellow-500/20 text-yellow-400" },
  { value: "needs_repair", label: "Needs Repair", color: "bg-red-500/20 text-red-400" },
];

function getDeviceMeta(type: string) {
  return DEVICE_TYPES.find(d => d.value === type) ?? DEVICE_TYPES[DEVICE_TYPES.length - 1];
}

function getPlatformMeta(platform: string) {
  return PLATFORMS.find(p => p.value === platform) ?? PLATFORMS[0];
}

function getConditionMeta(condition: string) {
  return CONDITIONS.find(c => c.value === condition) ?? CONDITIONS[1];
}

type Tab = "devices" | "drivers";

// ─── Device Card ──────────────────────────────────────────────────────────────

function DeviceCard({
  device,
  drivers,
  onEdit,
  onDelete,
}: {
  device: HardwareDevice;
  drivers: DriverLink[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();
  const meta = getDeviceMeta(device.deviceType);
  const condMeta = getConditionMeta(device.condition);
  const Icon = meta.icon;
  const relevantDrivers = drivers.filter(d =>
    d.make.toLowerCase() === device.make.toLowerCase() &&
    (d.model == null || d.model.toLowerCase() === device.model.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-4 flex items-center gap-4">
            {/* Icon */}
            <div className="shrink-0 w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center">
              <Icon className={cn("h-5 w-5", meta.color)} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{device.make} {device.model}</p>
                <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                <Badge className={cn("text-xs", condMeta.color)}>{condMeta.label}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                {device.serialNumber && <span>S/N: <span className="font-mono">{device.serialNumber}</span></span>}
                {device.location && <span>📍 {device.location}</span>}
                {device.purchaseDate && <span>Purchased: {device.purchaseDate}</span>}
                {relevantDrivers.length > 0 && (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {relevantDrivers.length} driver{relevantDrivers.length > 1 ? "s" : ""} available
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => navigate("/store")}
                title="Shop compatible parts & consumables"
              >
                <ShoppingBag className="h-3 w-3" /> Shop Parts
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              {relevantDrivers.length > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-7 px-2"
                  onClick={() => setExpanded(e => !e)}
                  title="Show drivers"
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>
              )}
            </div>
          </div>

          {device.notes && (
            <div className="px-4 pb-3 -mt-1">
              <p className="text-xs text-muted-foreground italic">{device.notes}</p>
            </div>
          )}

          <AnimatePresence>
            {expanded && relevantDrivers.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <Separator />
                <div className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Available Drivers</p>
                  {relevantDrivers.map(drv => (
                    <div key={drv.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-secondary/30">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{drv.driverName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {drv.version && <span className="text-xs text-muted-foreground">v{drv.version}</span>}
                          <Badge className={cn("text-xs", getPlatformMeta(drv.platform).color)}>
                            {getPlatformMeta(drv.platform).label}
                          </Badge>
                          {drv.fileSize && <span className="text-xs text-muted-foreground">{drv.fileSize}</span>}
                        </div>
                      </div>
                      <Button
                        size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => window.open(drv.downloadUrl, "_blank", "noopener")}
                      >
                        <Download className="h-3 w-3" /> Download
                      </Button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Devices Tab ──────────────────────────────────────────────────────────────

const EMPTY_DEVICE: CreateHardwareDeviceInput = {
  deviceType: "printer",
  make: "",
  model: "",
  serialNumber: "",
  purchaseDate: "",
  condition: "good",
  location: "",
  notes: "",
};

function DevicesTab({ drivers }: { drivers: DriverLink[] }) {
  const { data: devices = [], isLoading } = useListHardwareDevices();
  const createDevice = useCreateHardwareDevice();
  const updateDevice = useUpdateHardwareDevice();
  const deleteDevice = useDeleteHardwareDevice();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<(CreateHardwareDeviceInput & { id?: number }) | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return devices.filter(d => {
      const matchesSearch = !q || `${d.make} ${d.model} ${d.serialNumber ?? ""} ${d.location ?? ""}`.toLowerCase().includes(q);
      const matchesType = filterType === "all" || d.deviceType === filterType;
      return matchesSearch && matchesType;
    });
  }, [devices, search, filterType]);

  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    devices.forEach(d => { counts[d.deviceType] = (counts[d.deviceType] ?? 0) + 1; });
    return counts;
  }, [devices]);

  function openNew() {
    setEditing({ ...EMPTY_DEVICE });
    setEditOpen(true);
  }

  function openEdit(d: HardwareDevice) {
    setEditing({
      id: d.id,
      deviceType: d.deviceType as DeviceType,
      make: d.make,
      model: d.model,
      serialNumber: d.serialNumber ?? "",
      purchaseDate: d.purchaseDate ?? "",
      condition: d.condition,
      location: d.location ?? "",
      notes: d.notes ?? "",
    });
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editing?.make?.trim() || !editing?.model?.trim()) return;
    const { id, ...data } = editing;
    const clean: CreateHardwareDeviceInput = {
      ...data,
      serialNumber: data.serialNumber || undefined,
      purchaseDate: data.purchaseDate || undefined,
      location: data.location || undefined,
      notes: data.notes || undefined,
    };
    if (id) {
      await updateDevice.mutateAsync({ id, data: clean });
      toast({ title: "Device updated" });
    } else {
      await createDevice.mutateAsync(clean);
      toast({ title: "Device registered" });
    }
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteDevice.mutateAsync(deleteId);
    toast({ title: "Device removed" });
    setDeleteId(null);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 h-full overflow-y-auto">
      {/* Stats */}
      {devices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{devices.length}</span> device{devices.length !== 1 ? "s" : ""} registered
          </div>
          <Separator orientation="vertical" className="h-4" />
          {Object.entries(stats).map(([type, count]) => {
            const meta = getDeviceMeta(type);
            const Icon = meta.icon;
            return (
              <div key={type} className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon className={cn("h-3.5 w-3.5", meta.color)} />
                <span>{count} {meta.label}{count > 1 ? "s" : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search devices…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {DEVICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={openNew} size="sm" className="ml-auto">
          <Plus className="h-4 w-4 mr-1.5" /> Register Device
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
          <Cpu className="h-12 w-12 opacity-20" />
          <p className="text-sm text-center">
            {search || filterType !== "all" ? "No devices match your filters" : "No hardware registered yet — add your first device"}
          </p>
          {!search && filterType === "all" && (
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Register your first device
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(device => (
              <DeviceCard
                key={device.id}
                device={device}
                drivers={drivers}
                onEdit={() => openEdit(device)}
                onDelete={() => setDeleteId(device.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Device" : "Register Device"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Device Type *</Label>
                  <Select value={editing.deviceType} onValueChange={v => setEditing(p => p ? { ...p, deviceType: v as DeviceType } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            <t.icon className={cn("h-3.5 w-3.5", t.color)} /> {t.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Make / Brand *</Label>
                  <Input
                    value={editing.make}
                    onChange={e => setEditing(p => p ? { ...p, make: e.target.value } : p)}
                    placeholder="e.g. Epson, Zebra, Star"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Model *</Label>
                  <Input
                    value={editing.model}
                    onChange={e => setEditing(p => p ? { ...p, model: e.target.value } : p)}
                    placeholder="e.g. TM-T88VI"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Serial Number</Label>
                  <Input
                    value={editing.serialNumber ?? ""}
                    onChange={e => setEditing(p => p ? { ...p, serialNumber: e.target.value } : p)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Purchase Date</Label>
                  <Input
                    type="date"
                    value={editing.purchaseDate ?? ""}
                    onChange={e => setEditing(p => p ? { ...p, purchaseDate: e.target.value } : p)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Condition</Label>
                  <Select value={editing.condition ?? "good"} onValueChange={v => setEditing(p => p ? { ...p, condition: v } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input
                    value={editing.location ?? ""}
                    onChange={e => setEditing(p => p ? { ...p, location: e.target.value } : p)}
                    placeholder="e.g. Main Counter, Kitchen"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editing.notes ?? ""} onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)} placeholder="Optional notes…" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editing?.make?.trim() || !editing?.model?.trim() || createDevice.isPending || updateDevice.isPending}>
              {editing?.id ? "Save Changes" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Device?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the device from your hardware registry. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Drivers Tab ──────────────────────────────────────────────────────────────

const EMPTY_DRIVER: CreateDriverLinkInput = {
  deviceType: "printer",
  make: "",
  driverName: "",
  downloadUrl: "",
  platform: "all",
  version: "",
  fileSize: "",
  releaseDate: "",
  notes: "",
  isActive: true,
};

function DriversTab({ canManage }: { canManage: boolean }) {
  const { data: allDrivers = [], isLoading } = useListDriverLinks();
  const createDriver = useCreateDriverLink();
  const updateDriver = useUpdateDriverLink();
  const deleteDriver = useDeleteDriverLink();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<(CreateDriverLinkInput & { id?: number }) | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allDrivers.filter(d => {
      const matchesSearch = !q || `${d.make} ${d.model ?? ""} ${d.driverName} ${d.version ?? ""}`.toLowerCase().includes(q);
      const matchesType = filterType === "all" || d.deviceType === filterType;
      const matchesPlatform = filterPlatform === "all" || d.platform === filterPlatform || d.platform === "all";
      return matchesSearch && matchesType && matchesPlatform;
    });
  }, [allDrivers, search, filterType, filterPlatform]);

  const grouped = useMemo(() => {
    const groups: Record<string, DriverLink[]> = {};
    filtered.forEach(d => {
      const key = `${d.deviceType}__${d.make}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    return groups;
  }, [filtered]);

  function openNew() {
    setEditing({ ...EMPTY_DRIVER });
    setEditOpen(true);
  }

  function openEdit(d: DriverLink) {
    setEditing({
      id: d.id,
      deviceType: d.deviceType as DeviceType,
      make: d.make,
      model: d.model ?? "",
      driverName: d.driverName,
      downloadUrl: d.downloadUrl,
      version: d.version ?? "",
      platform: d.platform as DriverPlatform,
      fileSize: d.fileSize ?? "",
      releaseDate: d.releaseDate ?? "",
      notes: d.notes ?? "",
      isActive: d.isActive,
    });
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editing?.make?.trim() || !editing?.driverName?.trim() || !editing?.downloadUrl?.trim()) return;
    const { id, ...data } = editing;
    const clean: CreateDriverLinkInput = {
      ...data,
      model: data.model || undefined,
      version: data.version || undefined,
      fileSize: data.fileSize || undefined,
      releaseDate: data.releaseDate || undefined,
      notes: data.notes || undefined,
    };
    if (id) {
      await updateDriver.mutateAsync({ id, data: clean });
      toast({ title: "Driver updated" });
    } else {
      await createDriver.mutateAsync(clean);
      toast({ title: "Driver added" });
    }
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteDriver.mutateAsync(deleteId);
    toast({ title: "Driver removed" });
    setDeleteId(null);
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 h-full overflow-y-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search drivers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Device Types</SelectItem>
            {DEVICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {PLATFORMS.filter(p => p.value !== "all").map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canManage && (
          <Button onClick={openNew} size="sm" className="ml-auto">
            <Plus className="h-4 w-4 mr-1.5" /> Add Driver
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
          <Download className="h-12 w-12 opacity-20" />
          <p className="text-sm text-center">
            {search || filterType !== "all" || filterPlatform !== "all"
              ? "No drivers match your filters"
              : "No driver links have been added yet"}
          </p>
          {canManage && !search && filterType === "all" && filterPlatform === "all" && (
            <Button size="sm" variant="outline" onClick={openNew}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add first driver link
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([key, driverList]) => {
            const [deviceType, make] = key.split("__");
            const meta = getDeviceMeta(deviceType);
            const Icon = meta.icon;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", meta.color)} />
                  <h3 className="font-semibold text-sm">{make}</h3>
                  <Badge variant="outline" className="text-xs">{meta.label}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {driverList.map(drv => (
                    <motion.div key={drv.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Card className={cn(!drv.isActive && "opacity-50")}>
                        <CardContent className="p-3 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{drv.driverName}</p>
                              {drv.model && <span className="text-xs text-muted-foreground">({drv.model})</span>}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {drv.version && <span className="text-xs text-muted-foreground font-mono">v{drv.version}</span>}
                              <Badge className={cn("text-xs", getPlatformMeta(drv.platform).color)}>
                                {getPlatformMeta(drv.platform).label}
                              </Badge>
                              {drv.fileSize && <span className="text-xs text-muted-foreground">{drv.fileSize}</span>}
                              {drv.releaseDate && <span className="text-xs text-muted-foreground">{drv.releaseDate}</span>}
                            </div>
                            {drv.notes && <p className="text-xs text-muted-foreground mt-1 italic">{drv.notes}</p>}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              size="sm" variant="default" className="h-7 text-xs gap-1"
                              onClick={() => window.open(drv.downloadUrl, "_blank", "noopener")}
                            >
                              <Download className="h-3 w-3" /> Download
                            </Button>
                            {canManage && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 flex-1" onClick={() => openEdit(drv)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 px-1.5 flex-1 text-destructive hover:text-destructive" onClick={() => setDeleteId(drv.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit Driver Link" : "Add Driver Link"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Device Type *</Label>
                  <Select value={editing.deviceType} onValueChange={v => setEditing(p => p ? { ...p, deviceType: v as DeviceType } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEVICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Platform *</Label>
                  <Select value={editing.platform} onValueChange={v => setEditing(p => p ? { ...p, platform: v as DriverPlatform } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Make / Brand *</Label>
                  <Input value={editing.make} onChange={e => setEditing(p => p ? { ...p, make: e.target.value } : p)} placeholder="e.g. Epson" />
                </div>
                <div className="space-y-1.5">
                  <Label>Model <span className="text-muted-foreground text-xs">(leave blank for all models)</span></Label>
                  <Input value={editing.model ?? ""} onChange={e => setEditing(p => p ? { ...p, model: e.target.value } : p)} placeholder="e.g. TM-T88VI" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Driver Name *</Label>
                  <Input value={editing.driverName} onChange={e => setEditing(p => p ? { ...p, driverName: e.target.value } : p)} placeholder="e.g. Epson Advanced Printer Driver 5" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Download URL *</Label>
                  <Input
                    value={editing.downloadUrl}
                    onChange={e => setEditing(p => p ? { ...p, downloadUrl: e.target.value } : p)}
                    placeholder="https://…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Version</Label>
                  <Input value={editing.version ?? ""} onChange={e => setEditing(p => p ? { ...p, version: e.target.value } : p)} placeholder="e.g. 5.02" />
                </div>
                <div className="space-y-1.5">
                  <Label>File Size</Label>
                  <Input value={editing.fileSize ?? ""} onChange={e => setEditing(p => p ? { ...p, fileSize: e.target.value } : p)} placeholder="e.g. 45 MB" />
                </div>
                <div className="space-y-1.5">
                  <Label>Release Date</Label>
                  <Input value={editing.releaseDate ?? ""} onChange={e => setEditing(p => p ? { ...p, releaseDate: e.target.value } : p)} placeholder="e.g. 2024-01-15" />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={editing.isActive ? "active" : "inactive"} onValueChange={v => setEditing(p => p ? { ...p, isActive: v === "active" } : p)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={editing.notes ?? ""} onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)} placeholder="Optional notes…" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!editing?.make?.trim() || !editing?.driverName?.trim() || !editing?.downloadUrl?.trim() || createDriver.isPending || updateDriver.isPending}
            >
              {editing?.id ? "Save Changes" : "Add Driver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Driver?</AlertDialogTitle>
            <AlertDialogDescription>This driver link will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MyHardware() {
  const [activeTab, setActiveTab] = useState<Tab>("devices");
  const { data: allDrivers = [] } = useListDriverLinks();
  const { currentStaff } = useStaff();
  const canManage = (currentStaff?.role === "manager" || currentStaff?.role === "admin" || currentStaff?.role === "owner");

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "devices", label: "My Devices",       icon: Cpu },
    { id: "drivers", label: "Driver Downloads", icon: Download },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header + tabs */}
      <div className="shrink-0 px-4 sm:px-6 pt-4 border-b border-border pb-0">
        <div className="mb-3">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Cpu className="h-5 w-5 text-sky-300" /> My Hardware
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Register your POS equipment, download drivers, and order compatible parts
          </p>
        </div>
        <div className="flex items-center gap-1 -mb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-md border-b-2 transition-all",
                  active
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "devices" && <DevicesTab drivers={allDrivers} />}
        {activeTab === "drivers" && <DriversTab canManage={canManage} />}
      </div>
    </div>
  );
}
