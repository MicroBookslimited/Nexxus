import { useState } from "react";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff } from "@workspace/api-client-react";
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
import { Plus, Edit2, Trash2, UserCog, ShieldCheck, User, KeyRound, ChefHat, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const ROLE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  admin: { label: "Admin", icon: ShieldCheck, color: "bg-red-500/20 text-red-400 border-red-500/30" },
  manager: { label: "Manager", icon: BarChart2, color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  cashier: { label: "Cashier", icon: User, color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  kitchen: { label: "Kitchen", icon: ChefHat, color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

function StaffCard({ member, onEdit, onDeactivate }: { member: StaffMember; onEdit: (m: StaffMember) => void; onDeactivate: (id: number) => void }) {
  const roleConfig = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.cashier;
  const RoleIcon = roleConfig.icon;
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm", !member.isActive && "opacity-50")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
            <span className="text-base font-bold text-primary">{member.name.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <p className="font-semibold text-sm">{member.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Since {format(new Date(member.createdAt), "MMM yyyy")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-xs", roleConfig.color)}>
          <RoleIcon className="h-2.5 w-2.5 mr-1" />
          {roleConfig.label}
        </Badge>
      </div>
      {!member.isActive && (
        <Badge variant="outline" className="text-xs w-fit bg-secondary/50 text-muted-foreground">Inactive</Badge>
      )}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => onEdit(member)}>
          <Edit2 className="h-3 w-3 mr-1" /> Edit
        </Button>
        {member.isActive && (
          <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDeactivate(member.id)}>
            <Trash2 className="h-3 w-3 mr-1" /> Deactivate
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
}

function StaffDialog({
  open,
  member,
  onClose,
  onSave,
}: {
  open: boolean;
  member: StaffMember | null;
  onClose: () => void;
  onSave: (data: StaffForm) => void;
}) {
  const [form, setForm] = useState<StaffForm>(() => ({
    name: member?.name ?? "",
    pin: "",
    role: member?.role ?? "cashier",
    isActive: member?.isActive ?? true,
  }));

  const isEditing = !!member;

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
              PIN {isEditing && <span className="text-xs text-muted-foreground">(leave blank to keep current)</span>}
            </Label>
            <Input
              type="password"
              maxLength={6}
              value={form.pin}
              onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "") }))}
              placeholder={isEditing ? "••••" : "4–6 digit PIN"}
            />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_CONFIG).map(([value, { label, icon: Icon }]) => (
                  <SelectItem key={value} value={value}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name.trim() || (!isEditing && form.pin.length < 4)}
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
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/staff"] });

  const handleSave = (data: StaffForm) => {
    if (editingMember) {
      const payload: { name?: string; pin?: string; role?: string; isActive?: boolean } = {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
      };
      if (data.pin) payload.pin = data.pin;
      updateStaff.mutate(
        { id: editingMember.id, data: payload },
        {
          onSuccess: () => { toast({ title: "Staff member updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Error", description: "Could not update staff member", variant: "destructive" }),
        },
      );
    } else {
      createStaff.mutate(
        { data: { name: data.name, pin: data.pin, role: data.role } },
        {
          onSuccess: () => { toast({ title: "Staff member created" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Error", description: "Could not create staff member", variant: "destructive" }),
        },
      );
    }
  };

  const handleDeactivate = (id: number) => {
    deleteStaff.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Staff member deactivated" }); invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not deactivate staff member", variant: "destructive" }),
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

      <div className="flex-1 overflow-auto p-6 space-y-6">
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
                      onEdit={(mem) => { setEditingMember(mem); setDialogOpen(true); }}
                      onDeactivate={handleDeactivate}
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
                      onEdit={(mem) => { setEditingMember(mem); setDialogOpen(true); }}
                      onDeactivate={handleDeactivate}
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
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
