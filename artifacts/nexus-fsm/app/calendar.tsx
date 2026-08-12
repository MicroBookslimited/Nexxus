/**
 * Appointment calendar — daily, weekly or monthly view of upcoming visits.
 *
 * Admins/managers/supervisors see every appointment; technicians see only
 * the visits assigned to them.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  canEditWorkOrders,
  getCalendarAppointments,
  type CalendarAppointment,
} from '@/lib/fsm-api';

type Mode = 'day' | 'week' | 'month';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** DST-safe calendar-day arithmetic. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday start
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const TYPE_LABELS: Record<string, string> = {
  follow_up: 'Follow-up',
  assessment: 'Assessment',
  repair: 'Repair',
  installation: 'Installation',
  site_visit: 'Site visit',
  pickup: 'Pickup',
  delivery: 'Delivery',
};

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();

  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<string>(dayKey(new Date()));

  const seesAll = canEditWorkOrders(staff?.role);

  // Visible range for the current mode.
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (mode === 'day') {
      const s = startOfDay(anchor);
      return { rangeStart: s, rangeEnd: addDays(s, 1) };
    }
    if (mode === 'week') {
      const s = startOfWeek(anchor);
      return { rangeStart: s, rangeEnd: addDays(s, 7) };
    }
    const s = startOfMonth(anchor);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    return { rangeStart: s, rangeEnd: e };
  }, [mode, anchor]);

  const apptsQuery = useQuery({
    queryKey: ['fsm-calendar', staff?.id, rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () => getCalendarAppointments(staff!.id, rangeStart.toISOString(), rangeEnd.toISOString()),
    enabled: !!staff,
  });

  // The server already restricts technicians to their own visits; this is
  // just a belt-and-braces client-side mirror of the same rule.
  const appts = useMemo(() => {
    const all = apptsQuery.data ?? [];
    const mine = seesAll
      ? all
      : all.filter((a) => {
          const team = a.staffIds?.length
            ? a.staffIds
            : a.staffId != null
              ? [a.staffId]
              : a.assignedStaffIds ?? [];
          return team.includes(staff?.id ?? -1);
        });
    return mine.filter((a) => a.status !== 'cancelled');
  }, [apptsQuery.data, seesAll, staff?.id]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appts) {
      const k = dayKey(new Date(a.startTime));
      const list = map.get(k) ?? [];
      list.push(a);
      map.set(k, list);
    }
    return map;
  }, [appts]);

  const navigate = (dir: -1 | 1) => {
    const next = new Date(anchor);
    if (mode === 'day') next.setDate(next.getDate() + dir);
    else if (mode === 'week') next.setDate(next.getDate() + dir * 7);
    else next.setMonth(next.getMonth() + dir);
    setAnchor(next);
    if (mode === 'day') setSelectedDay(dayKey(next));
  };

  const headerLabel = useMemo(() => {
    if (mode === 'day') {
      return anchor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    }
    if (mode === 'week') {
      const s = startOfWeek(anchor);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
    }
    return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }, [mode, anchor]);

  const renderAppt = (a: CalendarAppointment) => (
    <Pressable
      key={`${a.id}`}
      onPress={() => router.push(`/job/${a.workOrderId}`)}
      style={[styles.apptCard, { backgroundColor: colors.card, borderColor: a.appointmentType === 'follow_up' ? colors.accent : colors.border }]}
    >
      <View style={styles.apptTimeCol}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '700' }}>{fmtTime(a.startTime)}</Text>
        {a.endTime ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>– {fmtTime(a.endTime)}</Text>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{a.workOrderNumber}</Text>
          <View style={[styles.typeBadge, { backgroundColor: a.appointmentType === 'follow_up' ? colors.accent : colors.primary }]}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {TYPE_LABELS[a.appointmentType] ?? a.appointmentType}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
          {a.itemDescription}
        </Text>
        {!!a.customerName && (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {a.customerName}
          </Text>
        )}
        {!!a.notes && (
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
            {a.notes}
          </Text>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );

  const renderDayList = (keys: string[]) => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
      {keys.every((k) => !(byDay.get(k)?.length)) ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Feather name="calendar" size={30} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, marginTop: 10 }}>No appointments in this period.</Text>
        </View>
      ) : (
        keys.map((k) => {
          const list = byDay.get(k);
          if (!list?.length) return null;
          const d = new Date(`${k}T00:00:00`);
          return (
            <View key={k} style={{ marginBottom: 18 }}>
              {keys.length > 1 && (
                <Text style={[styles.dayHeading, { color: dayKey(new Date()) === k ? colors.primary : colors.mutedForeground }]}>
                  {d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                  {dayKey(new Date()) === k ? '  ·  Today' : ''}
                </Text>
              )}
              {list.map(renderAppt)}
            </View>
          );
        })
      )}
    </ScrollView>
  );

  // ── Month grid ──
  const monthGrid = useMemo(() => {
    if (mode !== 'month') return [];
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const weeks: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) row.push(addDays(gridStart, w * 7 + d));
      weeks.push(row);
      if (row[6]!.getMonth() !== first.getMonth() && row[6]! > first) break;
    }
    return weeks;
  }, [mode, anchor]);

  const weekKeys = useMemo(() => {
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(s, i)));
  }, [anchor]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Appointments</Text>
      </View>

      {/* Mode toggle */}
      <View style={[styles.toggleRow, { borderBottomColor: colors.border }]}>
        {(['day', 'week', 'month'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.toggleBtn, { backgroundColor: mode === m ? colors.primary : 'transparent', borderColor: mode === m ? colors.primary : colors.border }]}
          >
            <Text style={{ color: mode === m ? '#fff' : colors.foreground, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>
              {m}
            </Text>
          </Pressable>
        ))}
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => { const today = startOfDay(new Date()); setAnchor(today); setSelectedDay(dayKey(today)); }}
          hitSlop={8}
        >
          <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Today</Text>
        </Pressable>
      </View>

      {/* Range navigation */}
      <View style={styles.navRow}>
        <Pressable onPress={() => navigate(-1)} hitSlop={10} style={{ padding: 6 }}>
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: '700' }}>{headerLabel}</Text>
        <Pressable onPress={() => navigate(1)} hitSlop={10} style={{ padding: 6 }}>
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {apptsQuery.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : mode === 'day' ? (
        renderDayList([dayKey(anchor)])
      ) : mode === 'week' ? (
        renderDayList(weekKeys)
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={{ paddingHorizontal: 10 }}>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((w) => (
                <Text key={w} style={[styles.weekdayLabel, { color: colors.mutedForeground }]}>{w}</Text>
              ))}
            </View>
            {monthGrid.map((row, i) => (
              <View key={i} style={{ flexDirection: 'row' }}>
                {row.map((d) => {
                  const k = dayKey(d);
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const count = byDay.get(k)?.length ?? 0;
                  const isSel = selectedDay === k;
                  const isToday = dayKey(new Date()) === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setSelectedDay(k)}
                      style={[styles.monthCell, isSel && { backgroundColor: colors.primary + '22', borderColor: colors.primary, borderWidth: 1, borderRadius: 8 }]}
                    >
                      <Text style={{
                        color: !inMonth ? colors.border : isToday ? colors.primary : colors.foreground,
                        fontSize: 13,
                        fontWeight: isToday ? '800' : '500',
                      }}>
                        {d.getDate()}
                      </Text>
                      {count > 0 && (
                        <View style={[styles.dot, { backgroundColor: inMonth ? colors.accent : colors.border }]} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <Text style={[styles.dayHeading, { color: colors.mutedForeground }]}>
              {new Date(`${selectedDay}T00:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            {(byDay.get(selectedDay) ?? []).length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>No appointments this day.</Text>
            ) : (
              (byDay.get(selectedDay) ?? []).map(renderAppt)
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  toggleBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 7 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  dayHeading: { fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  apptCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  apptTimeCol: { width: 74 },
  typeBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  monthCell: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
