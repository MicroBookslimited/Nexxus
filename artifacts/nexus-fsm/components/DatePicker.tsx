/**
 * Lightweight inline calendar date picker — no native modules required.
 *
 * Renders a month grid with previous / next navigation and highlights the
 * selected date. Works identically on iOS, Android, and Expo Web.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface DatePickerProps {
  /** Current value in YYYY-MM-DD format, or "" for none. */
  value: string;
  /** Called with a YYYY-MM-DD string when the user taps a day. */
  onChange: (dateYmd: string) => void;
  /** Earliest selectable date (inclusive). Defaults to today. */
  minDate?: Date;
  /** Latest selectable date (inclusive). Defaults to 2 years from now. */
  maxDate?: Date;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export default function DatePicker({ value, onChange, minDate, maxDate }: DatePickerProps) {
  const colors = useColors();
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const min = minDate ?? today;
  const max = maxDate ?? new Date(today.getFullYear() + 2, today.getMonth(), today.getDate());

  const selected = parseYmd(value);
  const [year, setYear] = useState(() => selected?.getFullYear() ?? today.getFullYear());
  const [month, setMonth] = useState(() => selected?.getMonth() ?? today.getMonth());

  const prevMonth = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  // Can we navigate?
  const canPrev = new Date(year, month, 1) > new Date(min.getFullYear(), min.getMonth(), 1);
  const canNext = new Date(year, month + 1, 1) <= new Date(max.getFullYear(), max.getMonth() + 1, 1);

  // Build the 6×7 grid of day cells (nulls = empty leading/trailing cells)
  const days: (number | null)[] = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const todayYmd = ymd(today);
  const selectedYmd = value;

  const isDisabled = (day: number) => {
    const d = new Date(year, month, day);
    return d < min || d > max;
  };

  const cellDate = (day: number) => new Date(year, month, day);

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={prevMonth}
          disabled={!canPrev}
          hitSlop={10}
          style={[styles.navBtn, !canPrev && { opacity: 0.3 }]}
        >
          <Feather name="chevron-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <Pressable
          onPress={nextMonth}
          disabled={!canNext}
          hitSlop={10}
          style={[styles.navBtn, !canNext && { opacity: 0.3 }]}
        >
          <Feather name="chevron-right" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      {/* Day-of-week labels */}
      <View style={styles.row}>
        {DAY_LABELS.map((d) => (
          <Text key={d} style={[styles.dayLabel, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      {Array.from({ length: days.length / 7 }, (_, week) => (
        <View key={week} style={styles.row}>
          {days.slice(week * 7, week * 7 + 7).map((day, col) => {
            if (!day) return <View key={col} style={styles.cell} />;
            const dateStr = ymd(cellDate(day));
            const disabled = isDisabled(day);
            const isToday = dateStr === todayYmd;
            const isSelected = dateStr === selectedYmd;
            return (
              <Pressable
                key={col}
                onPress={() => !disabled && onChange(dateStr)}
                style={[
                  styles.cell,
                  isSelected && { backgroundColor: colors.primary, borderRadius: 20 },
                  !isSelected && isToday && { borderRadius: 20, borderWidth: 1, borderColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: disabled ? colors.mutedForeground : isSelected ? '#fff' : colors.foreground },
                    disabled && { opacity: 0.35 },
                    isToday && !isSelected && { color: colors.primary, fontFamily: 'Inter_700Bold' },
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, padding: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { padding: 4 },
  monthLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 2 },
  dayLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontFamily: 'Inter_500Medium', marginBottom: 4 },
  cell: { width: CELL_SIZE, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
});
