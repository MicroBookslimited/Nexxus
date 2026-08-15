import { useMemo, useState } from "react";
import { useListStaff } from "@workspace/api-client-react";
import type { StaffMember } from "@workspace/api-zod";
import type { TechnicianTeam, TeamMember } from "@/lib/assets-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Users, Crown, Pencil, Trash2, Plus, X, Wrench, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  team: TechnicianTeam;
  onEdit: () => void;
  onDelete: () => void;
  onAddMembers: (staffIds: number[]) => void;
  onRemoveMember: (staffId: number, isLeader: boolean) => void;
  busy: boolean;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("");
}

export function TeamCard({ team, onEdit, onDelete, onAddMembers, onRemoveMember, busy }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm",
        !team.isActive && "opacity-60",
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: team.colour ?? "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: team.colour ?? "#94a3b8" }}
          />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{team.name}</p>
            {team.description && (
              <p className="text-xs text-muted-foreground truncate">{team.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!team.isActive && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Leader */}
      {team.leaderStaffId != null && (
        <div className="flex items-center gap-1.5 text-xs">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-muted-foreground">Leader:</span>
          <span className="font-medium">{team.leaderName ?? `#${team.leaderStaffId}`}</span>
        </div>
      )}

      {/* Members */}
      <div className="space-y-1.5">
        {team.members.length === 0 ? (
          <p className="text-xs text-muted-foreground">No members yet.</p>
        ) : (
          <TooltipProvider>
            <div className="flex flex-col gap-1">
              {team.members.map((m) => (
                <MemberRow
                  key={m.staffId}
                  member={m}
                  isLeader={m.staffId === team.leaderStaffId}
                  busy={busy}
                  onRemove={() => onRemoveMember(m.staffId, m.staffId === team.leaderStaffId)}
                />
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border pt-2.5">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {team.memberCount} member{team.memberCount === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {team.openJobCount} open job{team.openJobCount === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> {team.toolCount} tool{team.toolCount === 1 ? "" : "s"} held</span>
      </div>

      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdding(true)} disabled={busy}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add members
      </Button>

      {adding && (
        <AddMembersDialog
          existingIds={team.members.map((m) => m.staffId)}
          onClose={() => setAdding(false)}
          onAdd={(ids) => { onAddMembers(ids); setAdding(false); }}
        />
      )}
    </div>
  );

  function MemberRow({
    member, isLeader, busy, onRemove,
  }: { member: TeamMember; isLeader: boolean; busy: boolean; onRemove: () => void }) {
    return (
      <div className="flex items-center gap-2 group">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold shrink-0">
          {initials(member.name)}
        </span>
        <span className="text-xs flex-1 truncate">
          {member.name}
          <span className="text-muted-foreground"> · {member.role}</span>
        </span>
        {member.isTechnician && (
          <span className="text-[9px] font-medium uppercase tracking-wide text-emerald-600 bg-emerald-500/10 rounded px-1 py-0.5">Tech</span>
        )}
        {isLeader ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-40" disabled>
                  <X className="h-3 w-3" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Reassign the leader before removing them</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            disabled={busy}
            onClick={onRemove}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }
}

function AddMembersDialog({
  existingIds, onClose, onAdd,
}: {
  existingIds: number[];
  onClose: () => void;
  onAdd: (staffIds: number[]) => void;
}) {
  const { data: staff } = useListStaff();
  const [selected, setSelected] = useState<number[]>([]);

  const candidates = useMemo(() => {
    const list = (staff ?? []).filter((s: StaffMember) => s.isActive && !existingIds.includes(s.id));
    return [...list].sort((a, b) => {
      const at = a.isTechnician ? 0 : 1;
      const bt = b.isTechnician ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }, [staff, existingIds]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Members</DialogTitle>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Everyone is already on this team.</p>
        ) : (
          <div className="border border-input rounded-md bg-background max-h-64 overflow-y-auto divide-y divide-border">
            {candidates.map((s) => {
              const checked = selected.includes(s.id);
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.id)}
                    className="h-3.5 w-3.5 accent-primary shrink-0"
                  />
                  <span className="text-sm flex-1">{s.name}</span>
                  {s.isTechnician && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 bg-emerald-500/10 rounded px-1.5 py-0.5">Tech</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onAdd(selected)} disabled={selected.length === 0}>
            Add {selected.length > 0 ? `(${selected.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
