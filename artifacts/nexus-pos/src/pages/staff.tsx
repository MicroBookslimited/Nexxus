import { useState, useEffect, useRef } from "react";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, useGetSettings } from "@workspace/api-client-react";
import type { StaffMember } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, UserCog, KeyRound, MapPin, CreditCard, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { getRoles, type RoleRow, TENANT_TOKEN_KEY } from "@/lib/saas-api";

interface Location { id: number; name: string; address: string | null; isActive: boolean; }
interface StaffLocationRow { id: number; locationId: number; isPrimary: boolean; locationName: string | null; }

interface OverrideCardRow {
  id: number;
  staffId: number;
  last4: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

function OverrideCardsSection({ staffId }: { staffId: number }) {
  const { toast } = useToast();
  const [cards, setCards] = useState<OverrideCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const refresh = () => {
    setLoading(true);
    staffApi<OverrideCardRow[]>(`/staff/${staffId}/override-cards`)
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [staffId]);

  const onCaptured = async (cardData: string, label: string | null) => {
    try {
      await staffApi(`/staff/${staffId}/override-cards`, {
        method: "POST",
        body: JSON.stringify({ cardData, label }),
      });
      toast({ title: "Card linked" });
      setCapturing(false);
      refresh();
    } catch (e: any) {
      toast({ title: "Could not link card", description: e.message, variant: "destructive" });
    }
  };

  const onDelete = async (cardId: number) => {
    try {
      await staffApi(`/staff/${staffId}/override-cards/${cardId}`, { method: "DELETE" });
      toast({ title: "Card removed" });
      refresh();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <CreditCard className="h-3 w-3" />
          Override Cards
          <span className="text-xs text-muted-foreground font-normal">· swipe to authorize</span>
        </Label>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCapturing(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-xs text-muted-foreground">No cards linked.</p>
      ) : (
        <div className="space-y-1.5">
          {cards.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-secondary/30">
              <div className="min-w-0">
                <p className="text-xs font-mono">•••• {c.last4}</p>
                {c.label && <p className="text-[10px] text-muted-foreground truncate">{c.label}</p>}
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => onDelete(c.id)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {capturing && (
        <CardCaptureDialog onClose={() => setCapturing(false)} onCaptured={onCaptured} />
      )}
    </div>
  );
}

function CardCaptureDialog({
  onClose,
  onCaptured,
}: {
  onClose: () => void;
  onCaptured: (cardData: string, label: string | null) => void;
}) {
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<"waiting" | "captured">("waiting");
  const buffer = useRef("");
  const startedAt = useRef(0);
  const captured = useRef("");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing into the Label input so the user can still type `;`/`%`
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      // Allow swipes through inputs too (mag-stripe readers always start
      // with %/; — collect them globally) BUT once buffered, don't echo.
      const now = Date.now();
      const inSwipe = buffer.current.length > 0 && (now - startedAt.current) < 3000;

      if (e.key === "%" || e.key === ";") {
        buffer.current = e.key;
        startedAt.current = now;
        if (isEditable) e.preventDefault();
        return;
      }
      if (inSwipe) {
        if (e.key === "Enter" || e.key === "?") {
          const data = buffer.current + (e.key === "?" ? "?" : "");
          buffer.current = "";
          captured.current = data;
          setStatus("captured");
          e.preventDefault();
          return;
        }
        if (e.key.length === 1) {
          buffer.current += e.key;
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            Capture Override Card
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {status === "waiting" ? (
            <div className="text-center py-8 space-y-3">
              <CreditCard className="h-12 w-12 text-primary/40 mx-auto animate-pulse" />
              <p className="text-sm font-medium">Swipe the card now…</p>
              <p className="text-xs text-muted-foreground">Any magstripe or HID card reader works.</p>
            </div>
          ) : (
            <div className="text-center py-4 space-y-3">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                <CreditCard className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-medium text-emerald-500">Card captured</p>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Black fob, Backup card"
              maxLength={50}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={status !== "captured"}
            onClick={() => onCaptured(captured.current, label.trim() || null)}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function staffAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

async function staffApi<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, { headers: staffAuthHeaders(), ...options });
  if (!resp.ok) { const err = await resp.json().catch(() => ({ error: resp.statusText })) as { error?: string }; throw new Error(err.error ?? resp.statusText); }
  return resp.json() as Promise<T>;
}

function LocationAssignModal({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { toast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      staffApi<Location[]>("/locations"),
      staffApi<StaffLocationRow[]>(`/staff/${member.id}/locations`),
    ]).then(([locs, asgn]) => {
      setLocations(locs.filter(l => l.isActive));
      setSelected(new Set(asgn.map(a => a.locationId)));
      const primary = asgn.find(a => a.isPrimary);
      setPrimaryId(primary?.locationId ?? null);
    }).catch(() => {});
  }, [member.id]);

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) { next.delete(id); if (primaryId === id) setPrimaryId(null); }
    else next.add(id);
    return next;
  });

  async function save() {
    setSaving(true);
    try {
      await staffApi(`/staff/${member.id}/locations`, {
        method: "PUT",
        body: JSON.stringify({ locationIds: [...selected], primaryLocationId: primaryId ?? undefined }),
      });
      toast({ title: "Branch assignment saved" });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 min-w-0">
            <MapPin className="h-4 w-4 text-primary shrink-0" />
            <span className="truncate">Branch Access — {member.name}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {locations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No branches found. Create branches in the Locations page first.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Select which branches this staff member can access. Leave all unchecked for "all branches".</p>
              {locations.map(loc => {
                const isSelected = selected.has(loc.id);
                const isPrimary = primaryId === loc.id;
                return (
                  <div key={loc.id} className={cn("flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors", isSelected ? "border-primary/50 bg-primary/5" : "border-border/50 hover:border-border")} onClick={() => toggle(loc.id)}>
                    <div className={cn("h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors", isSelected ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                      {isSelected && <div className="h-2 w-2 bg-white rounded-sm" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{loc.name}</p>
                      {loc.address && <p className="text-xs text-muted-foreground truncate">{loc.address}</p>}
                    </div>
                    {isSelected && (
                      <button
                        className={cn("text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors shrink-0", isPrimary ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50")}
                        onClick={e => { e.stopPropagation(); setPrimaryId(isPrimary ? null : loc.id); }}
                      >
                        {isPrimary ? "Primary" : "Set Primary"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || locations.length === 0}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function roleStyle(color: string): string {
  return `border text-white/90`;
}

function StaffCard({
  member, roles, onEdit, onDeactivate, onAssignBranches,
}: {
  member: StaffMember;
  roles: RoleRow[];
  onEdit: (m: StaffMember) => void;
  onDeactivate: (id: number) => void;
  onAssignBranches: (m: StaffMember) => void;
}) {
  const matchedRole = roles.find(r => r.name.toLowerCase() === member.role.toLowerCase());
  const roleColor = matchedRole?.color ?? "#64748b";
  const roleLabel = matchedRole?.name ?? member.role;

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm", !member.isActive && "opacity-50")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-base font-bold text-primary">{member.name.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{member.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Since {format(new Date(member.createdAt), "MMM yyyy")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-xs shrink-0", roleStyle(roleColor))} style={{ borderColor: roleColor + "55", backgroundColor: roleColor + "22", color: roleColor }}>
          {roleLabel}
        </Badge>
      </div>
      {member.isTechnician && (
        <Badge variant="outline" className="text-xs w-fit border-blue-500/40 bg-blue-500/10 text-blue-500">Technician</Badge>
      )}
      {member.canReceiveCash && (
        <Badge variant="outline" className="text-xs w-fit border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Cash receiver</Badge>
      )}
      {!member.isActive && (
        <Badge variant="outline" className="text-xs w-fit bg-secondary/50 text-muted-foreground">Inactive</Badge>
      )}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => onEdit(member)}>
          <Edit2 className="h-3 w-3 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs text-primary hover:text-primary" onClick={() => onAssignBranches(member)} title="Assign Branches">
          <MapPin className="h-3 w-3 mr-1" /> Branches
        </Button>
        {member.isActive && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive px-2" onClick={() => onDeactivate(member.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface StaffForm {
  name: string;
  pin: string;
  role: string;
  isActive?: boolean;
  isTechnician: boolean;
  canReceiveCash: boolean;
  email: string;
}

function StaffDialog({
  open,
  member,
  roles,
  workOrdersEnabled,
  onClose,
  onSave,
}: {
  open: boolean;
  member: StaffMember | null;
  roles: RoleRow[];
  workOrdersEnabled: boolean;
  onClose: () => void;
  onSave: (data: StaffForm) => void;
}) {
  const defaultRole = roles[0]?.name ?? "Cashier";
  const [form, setForm] = useState<StaffForm>(() => ({
    name: member?.name ?? "",
    pin: "",
    role: member?.role ?? defaultRole,
    isActive: member?.isActive ?? true,
    isTechnician: member?.isTechnician ?? false,
    canReceiveCash: member?.canReceiveCash ?? false,
    email: member?.email ?? "",
  }));

  useEffect(() => {
    setForm({
      name: member?.name ?? "",
      pin: "",
      role: member?.role ?? (roles[0]?.name ?? "Cashier"),
      isActive: member?.isActive ?? true,
      isTechnician: member?.isTechnician ?? false,
      canReceiveCash: member?.canReceiveCash ?? false,
      email: member?.email ?? "",
    });
  }, [member, roles]);

  const isEditing = !!member;
  // Show the technician option when Work Orders is on, or when editing someone
  // already flagged (so it can be turned off even after the module is disabled).
  const showTechnician = workOrdersEnabled || form.isTechnician;
  const emailMissing = form.isTechnician && !/^\S+@\S+\.\S+$/.test(form.email.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Full Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Jane Smith"
            />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3" />
              PIN{" "}
              <span className="text-xs text-muted-foreground font-normal">
                {isEditing ? "(leave blank to keep current)" : "· must be unique across all staff"}
              </span>
            </Label>
            <Input
              type="password"
              maxLength={8}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
              placeholder={isEditing ? "••••" : "4–8 digit PIN"}
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            {roles.length > 0 ? (
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(r => (
                    <SelectItem key={r.id} value={r.name}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: r.color }} />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Role name"
              />
            )}
          </div>
          {showTechnician && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Field Technician</Label>
                  <p className="text-xs text-muted-foreground">Can be assigned to work orders and uses the field app</p>
                </div>
                <Switch
                  checked={form.isTechnician}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, isTechnician: checked }))}
                />
              </div>
              {form.isTechnician && (
                <div className="space-y-1">
                  <Label>
                    Email <span className="text-xs text-muted-foreground font-normal">· required for technicians</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="tech@example.com"
                  />
                  {emailMissing && form.email.trim() !== "" && (
                    <p className="text-xs text-destructive">Enter a valid email address</p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Can receive cash</Label>
              <p className="text-xs text-muted-foreground">May sign for cash handed in by technicians at the end of a shift</p>
            </div>
            <Switch
              checked={form.canReceiveCash}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, canReceiveCash: checked }))}
            />
          </div>
          {isEditing && (
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, isActive: checked }))}
              />
            </div>
          )}
          {isEditing && member && (
            <OverrideCardsSection staffId={member.id} />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || (!isEditing && form.pin.length < 4) || emailMissing}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Staff() {
  const { data: staff, isLoading } = useListStaff();
  const { data: settings } = useGetSettings();
  const workOrdersEnabled = settings?.work_orders_enabled === "true";
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [locationAssignMember, setLocationAssignMember] = useState<StaffMember | null>(null);

  useEffect(() => {
    getRoles().then(data => setRoles(data.roles)).catch(() => {});
  }, []);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/staff"] });

  const handleSave = (data: StaffForm) => {
    if (editingMember) {
      const payload: { name?: string; pin?: string; role?: string; isActive?: boolean; isTechnician?: boolean; canReceiveCash?: boolean; email?: string } = {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        isTechnician: data.isTechnician,
        canReceiveCash: data.canReceiveCash,
        email: data.email.trim(),
      };
      if (data.pin) payload.pin = data.pin;
      updateStaff.mutate(
        { id: editingMember.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Staff member updated" }); invalidate(); setDialogOpen(false); },
          onError: (err: any) => {
            const msg = err?.data?.error ?? err?.message ?? "Could not update staff member";
            toast({ title: "Could not update staff member", description: msg, variant: "destructive" });
          },
        },
      );
    } else {
      createStaff.mutate(
        { data: { name: data.name, pin: data.pin, role: data.role, isTechnician: data.isTechnician, canReceiveCash: data.canReceiveCash, ...(data.email.trim() ? { email: data.email.trim() } : {}) } },
        {
          onSuccess: () => { toast({ title: "Staff member created" }); invalidate(); setDialogOpen(false); },
          onError: (err: any) => {
            const msg = err?.data?.error ?? err?.message ?? "Could not create staff member";
            toast({ title: "Could not save staff member", description: msg, variant: "destructive" });
          },
        },
      );
    }
  };

  const handleDeactivate = (id: number) => {
    deleteStaff.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Staff member deactivated" }); invalidate(); },
        onError: (err: any) => {
          const msg = err?.data?.error ?? err?.message ?? "Could not deactivate staff member";
          toast({ title: "Could not deactivate staff member", description: msg, variant: "destructive" });
        },
      },
    );
  };

  const active = staff?.filter((s) => s.isActive) ?? [];
  const inactive = staff?.filter((s) => !s.isActive) ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <UserCog className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Staff Management</h1>
            <p className="text-xs text-muted-foreground">Manage accounts and roles</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">{active.length} active · {inactive.length} inactive</p>
          <Button
            size="sm"
            onClick={() => { setEditingMember(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Staff
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading staff…</div>
        ) : !staff?.length ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-muted-foreground">
            <UserCog className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium">No staff accounts yet</p>
              <p className="text-sm mt-1">Add staff members to track who processes orders</p>
            </div>
            <Button onClick={() => { setEditingMember(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add First Staff Member
            </Button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Active ({active.length})</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {active.map((m) => (
                    <StaffCard
                      key={m.id}
                      member={m}
                      roles={roles}
                      onEdit={(mem) => { setEditingMember(mem); setDialogOpen(true); }}
                      onDeactivate={handleDeactivate}
                      onAssignBranches={setLocationAssignMember}
                    />
                  ))}
                </div>
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">Inactive ({inactive.length})</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {inactive.map((m) => (
                    <StaffCard
                      key={m.id}
                      member={m}
                      roles={roles}
                      onEdit={(mem) => { setEditingMember(mem); setDialogOpen(true); }}
                      onDeactivate={handleDeactivate}
                      onAssignBranches={setLocationAssignMember}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <StaffDialog
        open={dialogOpen}
        member={editingMember}
        roles={roles}
        workOrdersEnabled={workOrdersEnabled}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
      {locationAssignMember && (
        <LocationAssignModal
          member={locationAssignMember}
          onClose={() => setLocationAssignMember(null)}
        />
      )}
    </div>
  );
}
