/**
 * Technician appointment time slots.
 *
 * Field work can't be promised to the minute, so visits are booked as a
 * two-hour arrival window rather than a fixed time. The office picks a date
 * plus one of these slots; the appointment row still stores real start/end
 * timestamps, so calendars, emails and the technician app keep working
 * unchanged — they just display a range.
 *
 * Times are interpreted in the local time of the device booking the visit,
 * matching how appointments were entered before slots existed.
 */

export interface AppointmentSlot {
  /** Stable id used by pickers, e.g. "9-11". */
  id: string;
  /** Full label, e.g. "9:00 AM – 11:00 AM". */
  label: string;
  /** Compact label for tight calendar cells, e.g. "9–11 AM". */
  shortLabel: string;
  /** Start hour in 24h local time. */
  startHour: number;
  /** End hour in 24h local time. */
  endHour: number;
}

export const APPOINTMENT_SLOTS: AppointmentSlot[] = [
  { id: "9-11", label: "9:00 AM – 11:00 AM", shortLabel: "9–11 AM", startHour: 9, endHour: 11 },
  { id: "11-1", label: "11:00 AM – 1:00 PM", shortLabel: "11–1", startHour: 11, endHour: 13 },
  { id: "1-3", label: "1:00 PM – 3:00 PM", shortLabel: "1–3 PM", startHour: 13, endHour: 15 },
];

export const DEFAULT_APPOINTMENT_SLOT_ID = APPOINTMENT_SLOTS[0].id;

export function getAppointmentSlot(slotId: string): AppointmentSlot | undefined {
  return APPOINTMENT_SLOTS.find((s) => s.id === slotId);
}

/** True when the date string is a real calendar date in YYYY-MM-DD form. */
export function isValidDateInput(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1])
    && d.getMonth() === Number(m[2]) - 1
    && d.getDate() === Number(m[3]);
}

/**
 * Turns a `YYYY-MM-DD` date plus a slot id into the concrete start/end
 * timestamps stored on the appointment. Returns null for an invalid date or
 * unknown slot.
 */
export function slotToRange(dateYmd: string, slotId: string): { start: Date; end: Date } | null {
  if (!isValidDateInput(dateYmd)) return null;
  const slot = getAppointmentSlot(slotId);
  if (!slot) return null;
  const [y, m, d] = dateYmd.trim().split("-").map(Number);
  return {
    start: new Date(y, m - 1, d, slot.startHour, 0, 0, 0),
    end: new Date(y, m - 1, d, slot.endHour, 0, 0, 0),
  };
}

/** The slot a stored appointment falls into, or null if it was booked at a custom time. */
export function slotIdForTimes(startTime: string | Date, endTime?: string | Date | null): string | null {
  const start = new Date(startTime);
  if (isNaN(start.getTime())) return null;
  const end = endTime ? new Date(endTime) : null;
  const match = APPOINTMENT_SLOTS.find((s) => s.startHour === start.getHours() && start.getMinutes() === 0);
  if (!match) return null;
  if (end && !isNaN(end.getTime()) && (end.getHours() !== match.endHour || end.getMinutes() !== 0)) return null;
  return match.id;
}

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "9:00 AM – 11:00 AM" for a booked window, or a single time when no end is set. */
export function formatAppointmentWindow(startTime: string | Date, endTime?: string | Date | null): string {
  const start = new Date(startTime);
  if (isNaN(start.getTime())) return "";
  const slot = slotIdForTimes(startTime, endTime);
  if (slot) return getAppointmentSlot(slot)!.label;
  const end = endTime ? new Date(endTime) : null;
  if (end && !isNaN(end.getTime())) return `${timeLabel(start)} – ${timeLabel(end)}`;
  return timeLabel(start);
}

/** Compact window label for dense calendar cells. */
export function formatAppointmentWindowShort(startTime: string | Date, endTime?: string | Date | null): string {
  const slot = slotIdForTimes(startTime, endTime);
  if (slot) return getAppointmentSlot(slot)!.shortLabel;
  return formatAppointmentWindow(startTime, endTime);
}

/** Date + window, e.g. "Aug 15, 2026 · 9:00 AM – 11:00 AM". */
export function formatAppointmentDateWindow(startTime: string | Date, endTime?: string | Date | null): string {
  const start = new Date(startTime);
  if (isNaN(start.getTime())) return "";
  const date = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${date} · ${formatAppointmentWindow(startTime, endTime)}`;
}
