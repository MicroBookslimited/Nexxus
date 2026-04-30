import { useMemo, useState } from "react";
import { Clock, LogIn, LogOut, MapPin, Users, Loader2, Calendar, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStaff } from "@/contexts/StaffContext";
import {
  useCurrentShift,
  useShiftList,
  useActiveShifts,
  useClockOut,
  useShiftElapsed,
  formatDuration,
} from "@/hooks/useStaffShift";
import { useToast } from "@/hooks/use-toast";

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-JM", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function ClockPage() {
  const { staff, can } = useStaff();
  const { toast } = useToast();

  const { data: currentShift, isLoading: loadingCurrent, refetch: refetchCurrent } = useCurrentShift();
  const elapsed = useShiftElapsed(currentShift?.clockInTime);
  const clockOutMut = useClockOut();

  // Manager-only: see all active staff
  const isManager = can("staff.manage") || can("staff.view");
  const { data: activeShifts = [], isLoading: loadingActive, refetch: refetchActive } = useActiveShifts(isManager);

  // History: my shifts (everyone) or all shifts (managers, when "All Staff" selected)
  const [historyTab, setHistoryTab] = useState<"mine" | "all">("mine");
  const [range, setRange] = useState<"today" | "week" | "all">("week");

  const filters = useMemo(() => {
    const f: { staffId?: number; from?: string; limit: number } = { limit: 200 };
    if (historyTab === "mine" && staff?.id) f.staffId = staff.id;
    if (range === "today") f.from = todayIso();
    if (range === "week") f.from = weekAgoIso();
    return f;
  }, [historyTab, staff?.id, range]);

  const {
    data: shifts = [],
    isLoading: loadingShifts,
    refetch: refetchShifts,
  } = useShiftList(filters);

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
      const e = err as Error;
      toast({ title: "Clock-out failed", description: e.message, variant: "destructive" });
    }
  };

  const totalSeconds = useMemo(
    () => shifts.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0),
    [shifts],
  );

  if (!staff) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Sign in as a staff member to use the time clock.</div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-emerald-400" />
            Time Clock
          </h1>
          <p className="text-xs text-muted-foreground">Clock in to start your shift, clock out when you're done.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            refetchCurrent();
            refetchActive();
            refetchShifts();
          }}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* CURRENT SHIFT CARD */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            My Current Shift
            {currentShift?.status === "active" && (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">
                ACTIVE
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCurrent ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking your shift…
            </div>
          ) : currentShift?.status === "active" ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="text-2xl font-bold tabular-nums text-emerald-400">
                  {formatDuration(elapsed)}
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>Started {fmtDateTime(currentShift.clockInTime)}</div>
                  {currentShift.locationName && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {currentShift.locationName}
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={handleClockOut}
                disabled={clockOutMut.isPending}
                className="bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-page-clock-out"
              >
                {clockOutMut.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Clocking out…
                  </>
                ) : (
                  <>
                    <LogOut className="h-3.5 w-3.5 mr-1.5" /> Clock Out
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                You're not clocked in. Use the green <span className="font-semibold text-emerald-400">Clock In</span>
                {" "}button in the top bar to start your shift.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LogIn className="h-3.5 w-3.5" /> Clocked out
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MANAGER VIEW: ACTIVE STAFF */}
      {isManager && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Active Staff Right Now
              <Badge variant="secondary" className="ml-1 text-[10px]">{activeShifts.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingActive ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : activeShifts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No staff are clocked in.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Staff</TableHead>
                      <TableHead className="text-xs">Location</TableHead>
                      <TableHead className="text-xs">Started</TableHead>
                      <TableHead className="text-xs text-right">Elapsed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeShifts.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs font-medium">{s.staffName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.locationName ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDateTime(s.clockInTime)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-emerald-400 font-semibold">
                          {formatDuration(s.elapsedSeconds ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* SHIFT HISTORY */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-violet-400" />
              Shift History
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant={range === "today" ? "default" : "ghost"}
                onClick={() => setRange("today")}
                className="h-7 text-[10px] px-2"
              >
                Today
              </Button>
              <Button
                size="sm"
                variant={range === "week" ? "default" : "ghost"}
                onClick={() => setRange("week")}
                className="h-7 text-[10px] px-2"
              >
                7 Days
              </Button>
              <Button
                size="sm"
                variant={range === "all" ? "default" : "ghost"}
                onClick={() => setRange("all")}
                className="h-7 text-[10px] px-2"
              >
                All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isManager ? (
            <Tabs value={historyTab} onValueChange={(v) => setHistoryTab(v as "mine" | "all")}>
              <TabsList className="mb-3">
                <TabsTrigger value="mine" className="text-xs">My Shifts</TabsTrigger>
                <TabsTrigger value="all" className="text-xs">All Staff</TabsTrigger>
              </TabsList>
              <TabsContent value="mine" className="mt-0">
                <ShiftHistoryTable shifts={shifts} loading={loadingShifts} totalSeconds={totalSeconds} />
              </TabsContent>
              <TabsContent value="all" className="mt-0">
                <ShiftHistoryTable shifts={shifts} loading={loadingShifts} totalSeconds={totalSeconds} showStaff />
              </TabsContent>
            </Tabs>
          ) : (
            <ShiftHistoryTable shifts={shifts} loading={loadingShifts} totalSeconds={totalSeconds} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShiftHistoryTable({
  shifts,
  loading,
  totalSeconds,
  showStaff,
}: {
  shifts: Array<{
    id: number;
    staffName: string;
    locationName: string | null;
    clockInTime: string;
    clockOutTime: string | null;
    durationSeconds?: number | null;
    status: string;
  }>;
  loading: boolean;
  totalSeconds: number;
  showStaff?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading shifts…
      </div>
    );
  }
  if (shifts.length === 0) {
    return <p className="text-xs text-muted-foreground">No shifts in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showStaff && <TableHead className="text-xs">Staff</TableHead>}
            <TableHead className="text-xs">Clock In</TableHead>
            <TableHead className="text-xs">Clock Out</TableHead>
            <TableHead className="text-xs">Location</TableHead>
            <TableHead className="text-xs text-right">Duration</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shifts.map((s) => (
            <TableRow key={s.id}>
              {showStaff && <TableCell className="text-xs font-medium">{s.staffName}</TableCell>}
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(s.clockInTime)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(s.clockOutTime)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{s.locationName ?? "—"}</TableCell>
              <TableCell className="text-xs text-right tabular-nums">
                {s.durationSeconds != null ? formatDuration(s.durationSeconds) : "—"}
              </TableCell>
              <TableCell>
                <Badge
                  variant={s.status === "active" ? "default" : "secondary"}
                  className={s.status === "active" ? "bg-emerald-600 hover:bg-emerald-600 text-[10px]" : "text-[10px]"}
                >
                  {s.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <tfoot>
          <TableRow>
            <TableCell colSpan={showStaff ? 4 : 3} className="text-xs font-semibold text-right">
              Total
            </TableCell>
            <TableCell className="text-xs text-right font-bold tabular-nums text-emerald-400">
              {formatDuration(totalSeconds)}
            </TableCell>
            <TableCell />
          </TableRow>
        </tfoot>
      </Table>
    </div>
  );
}
