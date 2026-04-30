import { useEffect, useState } from "react";
import { Clock, LogIn, LogOut, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import {
  useCurrentShift,
  useClockIn,
  useClockOut,
  useShiftElapsed,
  formatDuration,
} from "@/hooks/useStaffShift";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { cn } from "@/lib/utils";

interface Location {
  id: number;
  name: string;
}

/**
 * Compact clock-in/out button for the layout header.
 * - Shows nothing when no staff is signed in.
 * - When clocked-out: green "Clock In" button → opens dialog to select location.
 * - When clocked-in: red "Clock Out" pill with live elapsed timer.
 */
export function ShiftClockButton() {
  const { staff } = useStaff();
  const { toast } = useToast();
  const { data: currentShift, isFetching } = useCurrentShift();
  const clockInMut = useClockIn();
  const clockOutMut = useClockOut();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  const elapsed = useShiftElapsed(currentShift?.clockInTime);

  // Fetch locations when opening the clock-in dialog
  useEffect(() => {
    if (!dialogOpen) return;
    setLoadingLocations(true);
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    fetch("/api/locations", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Location[]) => {
        setLocations(rows);
        if (rows.length === 1) setSelectedLocationId(rows[0].id);
      })
      .catch(() => setLocations([]))
      .finally(() => setLoadingLocations(false));
  }, [dialogOpen]);

  if (!staff) return null;

  const isClockedIn = !!currentShift && currentShift.status === "active";

  const handleClockIn = async () => {
    if (!staff) return;
    try {
      await clockInMut.mutateAsync({
        staffId: staff.id,
        locationId: selectedLocationId,
        notes: notes.trim() || undefined,
      });
      toast({ title: "Clocked in", description: `Welcome, ${staff.name}.` });
      setDialogOpen(false);
      setNotes("");
    } catch (err) {
      const e = err as Error & { status?: number };
      toast({
        title: "Clock-in failed",
        description: e.message || "Unable to start shift.",
        variant: "destructive",
      });
    }
  };

  const handleClockOut = async () => {
    if (!staff) return;
    try {
      const result = await clockOutMut.mutateAsync({ staffId: staff.id });
      const dur = result.durationSeconds ?? elapsed;
      toast({
        title: "Clocked out",
        description: `Shift duration: ${formatDuration(dur)}.`,
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      toast({
        title: "Clock-out failed",
        description: e.message || "Unable to end shift.",
        variant: "destructive",
      });
    }
  };

  if (isClockedIn) {
    return (
      <button
        onClick={handleClockOut}
        disabled={clockOutMut.isPending}
        title={`Clock out — ${currentShift?.locationName ?? "current shift"}`}
        className={cn(
          "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors",
          "bg-red-500/10 border-red-500/30 hover:bg-red-500/20",
          "disabled:opacity-50 disabled:cursor-wait",
        )}
        data-testid="button-clock-out"
      >
        {clockOutMut.isPending ? (
          <Loader2 className="h-3 w-3 text-red-400 animate-spin" />
        ) : (
          <LogOut className="h-3 w-3 text-red-400" />
        )}
        <span className="text-[10px] font-bold text-red-400 tabular-nums">
          {formatDuration(elapsed)}
        </span>
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        disabled={isFetching}
        title="Clock in to start your shift"
        className={cn(
          "hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors",
          "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20",
          "disabled:opacity-50",
        )}
        data-testid="button-clock-in"
      >
        <LogIn className="h-3 w-3 text-emerald-400" />
        <span className="text-[10px] font-semibold text-emerald-400">Clock In</span>
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-sm"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              Start your shift
            </DialogTitle>
            <DialogDescription>
              {staff.name} ({staff.role}) — clock in to begin tracking your time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {loadingLocations ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading locations…
              </div>
            ) : locations.length > 0 ? (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Location {locations.length > 1 ? "(required)" : ""}
                </Label>
                <Select
                  value={selectedLocationId ? String(selectedLocationId) : ""}
                  onValueChange={(v) => setSelectedLocationId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No locations configured — clocking in without a location.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Covering for Sarah"
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleClockIn}
              disabled={
                clockInMut.isPending ||
                (locations.length > 1 && !selectedLocationId)
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-confirm-clock-in"
            >
              {clockInMut.isPending ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Clocking in…
                </>
              ) : (
                <>
                  <LogIn className="h-3 w-3 mr-1" /> Clock In
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
