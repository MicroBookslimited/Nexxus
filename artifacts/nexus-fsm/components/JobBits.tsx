import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#8CA0BC',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#F97316',
  emergency: '#EF4444',
};

export const STATUS_LABELS: Record<string, string> = {
  received: 'New',
  in_progress: 'In Progress',
  awaiting_parts: 'Awaiting Parts',
  on_hold: 'On Hold',
  ready: 'Ready',
  collected: 'Collected',
  cancelled: 'Cancelled',
};

export function Chip({ label, color, filled }: { label: string; color: string; filled?: boolean }) {
  return (
    <View
      style={[
        styles.chip,
        filled ? { backgroundColor: color } : { borderColor: color, borderWidth: 1 },
      ]}
    >
      <Text style={[styles.chipText, { color: filled ? '#04121C' : color }]}>{label}</Text>
    </View>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.normal;
  return <Chip label={priority.toUpperCase()} color={color} />;
}

/** Field-service channels: technician visits the client, so "ready" means the job is complete. */
const FIELD_CHANNELS = new Set(['on_site', 'remote']);

export function statusLabel(status: string, serviceChannel?: string | null): string {
  if (status === 'ready') {
    return FIELD_CHANNELS.has(serviceChannel ?? '') ? 'Job Complete' : 'Ready for Pickup';
  }
  return STATUS_LABELS[status] ?? status;
}

export function StatusChip({ status, serviceChannel }: { status: string; serviceChannel?: string | null }) {
  const colors = useColors();
  return <Chip label={statusLabel(status, serviceChannel)} color={colors.primary} />;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function isToday(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  chipText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
  },
});
