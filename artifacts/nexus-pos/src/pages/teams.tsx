import { useState } from "react";
import { useGetSettings } from "@workspace/api-client-react";
import {
  useTeams,
  useCreateTeam,
  useUpdateTeam,
  useAddTeamMembers,
  useRemoveTeamMember,
  useDeleteTeam,
} from "@/lib/assets-api";
import type { TechnicianTeam, TeamInput } from "@/lib/assets-api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, UsersRound } from "lucide-react";
import { TeamDialog } from "@/components/teams/TeamDialog";
import { TeamCard } from "@/components/teams/TeamCard";

export default function TeamsPage() {
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const [includeInactive, setIncludeInactive] = useState(false);

  const { data: teams, isLoading } = useTeams(includeInactive);
  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();
  const addMembers = useAddTeamMembers();
  const removeMember = useRemoveTeamMember();
  const deleteTeam = useDeleteTeam();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TechnicianTeam | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TechnicianTeam | null>(null);

  // Route-level module gate — mirrors src/pages/work-orders.tsx.
  if (settings && settings.work_orders_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Work Orders module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules to manage technician teams.</p>
      </div>
    );
  }

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (team: TechnicianTeam) => { setEditing(team); setDialogOpen(true); };

  const handleSave = (data: TeamInput) => {
    if (editing) {
      updateTeam.mutate(
        { id: editing.id, data },
        {
          onSuccess: () => { toast({ title: "Team updated" }); setDialogOpen(false); },
          onError: (e) => toast({ title: "Could not update team", description: e.message, variant: "destructive" }),
        },
      );
    } else {
      createTeam.mutate(data, {
        onSuccess: () => { toast({ title: "Team created" }); setDialogOpen(false); },
        onError: (e) => toast({ title: "Could not create team", description: e.message, variant: "destructive" }),
      });
    }
  };

  const handleAddMembers = (id: number, staffIds: number[]) => {
    if (staffIds.length === 0) return;
    addMembers.mutate(
      { id, staffIds },
      {
        onSuccess: () => toast({ title: `Added ${staffIds.length} member${staffIds.length === 1 ? "" : "s"}` }),
        onError: (e) => toast({ title: "Could not add members", description: e.message, variant: "destructive" }),
      },
    );
  };

  const handleRemoveMember = (id: number, staffId: number) => {
    removeMember.mutate(
      { id, staffId },
      {
        onSuccess: () => toast({ title: "Member removed" }),
        // The server rejects removing the leader — surface its reason as a toast.
        onError: (e) => toast({ title: "Could not remove member", description: e.message, variant: "destructive" }),
      },
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    deleteTeam.mutate(pendingDelete.id, {
      onSuccess: (res) => {
        // The server deactivates (instead of deleting) a team that is on jobs or
        // holding tools, and reports { deactivated, reason }.
        if (res && res.deactivated) {
          toast({
            title: `${name} deactivated`,
            description: res.reason || "The team is still referenced, so it was archived instead of deleted.",
          });
          if (!includeInactive) setIncludeInactive(true);
        } else {
          toast({ title: `${name} deleted` });
        }
        setPendingDelete(null);
      },
      onError: (e) => {
        toast({ title: "Could not delete team", description: e.message, variant: "destructive" });
        setPendingDelete(null);
      },
    });
  };

  const busy =
    addMembers.isPending || removeMember.isPending || deleteTeam.isPending || updateTeam.isPending;

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-500">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Technician Teams</h1>
            <p className="text-sm text-muted-foreground">
              Crews you can dispatch to a job together and that hold tools as a unit.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="include-inactive" checked={includeInactive} onCheckedChange={setIncludeInactive} />
            <Label htmlFor="include-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Include inactive
            </Label>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> New Team
          </Button>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Loading teams…</p>
        </div>
      ) : (teams ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <UsersRound className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="font-medium">No teams yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Bundle technicians into a crew so you can assign a whole team to a work order in one step and
            track the tools they sign out together.
          </p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Create your first team
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(teams ?? []).map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              busy={busy}
              onEdit={() => openEdit(team)}
              onDelete={() => setPendingDelete(team)}
              onAddMembers={(ids) => handleAddMembers(team.id, ids)}
              onRemoveMember={(staffId) => handleRemoveMember(team.id, staffId)}
            />
          ))}
        </div>
      )}

      {dialogOpen && (
        <TeamDialog
          open={dialogOpen}
          team={editing}
          saving={createTeam.isPending || updateTeam.isPending}
          onClose={() => setDialogOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!pendingDelete} onOpenChange={(o) => { if (!o) setPendingDelete(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {pendingDelete && (pendingDelete.openJobCount > 0 || pendingDelete.toolCount > 0)
                ? "This team is still on jobs or holding tools, so it will be archived (marked inactive) rather than permanently deleted."
                : "This permanently removes the team. Members and their individual records are unaffected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteTeam.isPending} onClick={confirmDelete}>
              {deleteTeam.isPending ? "Working…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
