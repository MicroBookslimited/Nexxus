import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  clockIn as clockInApi,
  clockOut as clockOutApi,
  getCurrentShift,
  listShifts,
  listActiveShifts,
  type StaffShift,
} from "@/lib/staff-shift-api";
import { useStaff } from "@/contexts/StaffContext";

const CURRENT_KEY = (staffId: number | null) => ["/api/staff/sessions/current", staffId] as const;
const LIST_KEY = (filters: object) => ["/api/staff/sessions", filters] as const;
const ACTIVE_KEY = ["/api/staff/sessions/active"] as const;

export function useCurrentShift() {
  const { staff } = useStaff();
  const staffId = staff?.id ?? null;

  return useQuery<StaffShift | null>({
    queryKey: CURRENT_KEY(staffId),
    queryFn: () => (staffId ? getCurrentShift(staffId) : Promise.resolve(null)),
    enabled: !!staffId,
    refetchInterval: 30_000,
    retry: false,
  });
}

export function useShiftList(filters: {
  staffId?: number;
  locationId?: number;
  status?: "active" | "closed";
  from?: string;
  to?: string;
  limit?: number;
} = {}) {
  return useQuery<StaffShift[]>({
    queryKey: LIST_KEY(filters),
    queryFn: () => listShifts(filters),
  });
}

export function useActiveShifts(enabled = true) {
  return useQuery<StaffShift[]>({
    queryKey: ACTIVE_KEY,
    queryFn: () => listActiveShifts(),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clockInApi,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CURRENT_KEY(vars.staffId) });
      qc.invalidateQueries({ queryKey: ["/api/staff/sessions"] });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: clockOutApi,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: CURRENT_KEY(vars.staffId) });
      qc.invalidateQueries({ queryKey: ["/api/staff/sessions"] });
      qc.invalidateQueries({ queryKey: ACTIVE_KEY });
    },
  });
}

/** Live ticking elapsed-seconds counter for an active shift. */
export function useShiftElapsed(clockInTime: string | null | undefined): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!clockInTime) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [clockInTime]);
  if (!clockInTime) return 0;
  // tick is referenced to force re-render — value derived directly from Date.now()
  void tick;
  return Math.max(0, Math.floor((Date.now() - new Date(clockInTime).getTime()) / 1000));
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
