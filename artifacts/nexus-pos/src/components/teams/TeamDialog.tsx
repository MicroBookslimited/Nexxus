import { useMemo, useState } from "react";
import { useListStaff } from "@workspace/api-client-react";
import type { StaffMember } from "@workspace/api-zod";
import type { TechnicianTeam, TeamInput } from "@/lib/assets-api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Curated palette for a team's colour tag — matches the small set of hues used across the POS. */
export const TEAM_COLOURS = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6",
];

interface Props {
  open: boolean;
  team: TechnicianTeam | null;
  onClose: () => void;
  onSave: (data: TeamInput) => void;
  saving: boolean;
}

/**
 * Create / edit a technician team. Members are picked from the tenant's staff
 * (technicians surfaced first, but anyone is allowed). The leader is restricted
 * to the chosen members; the server auto-adds a leader who isn't a member, so
 * the picker only offers current selections and we stay honest about that.
 */
export function TeamDialog({ open, team, onClose, onSave, saving }: Props) {
  const { data: staff } = useListStaff();
  const isEditing = !!team;

  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [colour, setColour] = useState(team?.colour ?? TEAM_COLOURS[0]);
  const [memberIds, setMemberIds] = useState<number[]>(team?.members.map((m) => m.staffId) ?? []);
  const [leaderId, setLeaderId] = useState<number | null>(team?.leaderStaffId ?? null);

  // Technicians first, then everyone else — both alphabetical within their group.
  const orderedStaff = useMemo(() => {
    const list = (staff ?? []).filter((s: StaffMember) => s.isActive);
    return [...list].sort((a, b) => {
      const at = a.isTechnician ? 0 : 1;
      const bt = b.isTechnician ? 0 : 1;
      if (at !== bt) return at - bt;
      return a.name.localeCompare(b.name);
    });
  }, [staff]);

  const toggleMember = (id: number) => {
    setMemberIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // A leader who is no longer a member falls back to unset.
      if (leaderId != null && !next.includes(leaderId)) setLeaderId(null);
      return next;
    });
  };

  const leaderChoices = orderedStaff.filter((s) => memberIds.includes(s.id));

  const handleSave = () => {
    onSave({
      name: name.trim(),
      description: description.trim() || null,
      colour,
      leaderStaffId: leaderId,
      memberStaffIds: memberIds,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Team" : "New Team"}</DialogTitle>
          <DialogDescription>
            Group technicians so they can be dispatched to a job together and hold tools as one crew.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Team name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Install Crew A" />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this crew handles (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition-transform",
                    colour === c ? "border-foreground scale-110" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>
              Members
              {memberIds.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-primary">({memberIds.length} selected)</span>
              )}
            </Label>
            {orderedStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active staff members found.</p>
            ) : (
              <div className="border border-input rounded-md bg-background max-h-48 overflow-y-auto divide-y divide-border">
                {orderedStaff.map((s) => {
                  const checked = memberIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(s.id)}
                        className="h-3.5 w-3.5 accent-primary shrink-0"
                      />
                      <span className="text-sm flex-1">{s.name}</span>
                      {s.isTechnician && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-600 bg-emerald-500/10 rounded px-1.5 py-0.5">
                          Tech
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Team leader</Label>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={leaderId ?? ""}
              disabled={leaderChoices.length === 0}
              onChange={(e) => setLeaderId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No leader</option>
              {leaderChoices.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {leaderChoices.length === 0
                ? "Pick members first — the leader must be one of them."
                : "The leader is always kept on as a member."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
