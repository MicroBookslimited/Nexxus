/**
 * Tool detail — condition, service state, the job the tool is out on, and its
 * recent custody history. The technician can flag its condition from here; the
 * tool stays in their hands until it is physically handed back through the
 * signed material return on the job.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/JobBits';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  getTool,
  reportToolCondition,
  type FsmToolHistory,
  type ToolCondition,
  type ToolServiceState,
} from '@/lib/fsm-api';

const CONDITIONS: { key: ToolCondition; label: string; color: string }[] = [
  { key: 'good', label: 'Good', color: '#22C55E' },
  { key: 'fair', label: 'Fair', color: '#F59E0B' },
  { key: 'needs_repair', label: 'Needs repair', color: '#F97316' },
  { key: 'out_of_service', label: 'Out of service', color: '#EF4444' },
];

const SERVICE_META: Partial<Record<ToolServiceState, { label: string; color: string }>> = {
  due_soon: { label: 'Service due soon', color: '#F59E0B' },
  overdue: { label: 'Service overdue', color: '#EF4444' },
};

function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ToolDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const params = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(params.id), 10);
  const qc = useQueryClient();

  const [condition, setCondition] = useState<ToolCondition | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toolQuery = useQuery({
    queryKey: ['fsm-tool', staff?.id, id],
    queryFn: () => getTool(staff!.id, id),
    enabled: !!staff && Number.isInteger(id),
  });

  const reportMutation = useMutation({
    mutationFn: () =>
      reportToolCondition(staff!.id, id, {
        condition: condition!,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      setError(null);
      setCondition(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['fsm-tool'] });
      void qc.invalidateQueries({ queryKey: ['fsm-tools'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not report the condition'),
  });

  const tool = toolQuery.data;

  const renderHistory = (h: FsmToolHistory) => (
    <View key={h.id} style={[styles.historyRow, { borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
          {h.assigneeType === 'team' ? (h.teamName ?? 'Team') : (h.staffName ?? 'Staff')}
          {h.workOrderNumber ? ` · ${h.workOrderNumber}` : ''}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 1 }}>
          Out {fmt(h.assignedAt)}
          {h.status === 'returned' ? ` · Back ${fmt(h.returnedAt)}` : ''}
        </Text>
      </View>
      <Chip
        label={h.status === 'active' ? 'OUT' : 'RETURNED'}
        color={h.status === 'active' ? colors.accent : colors.mutedForeground}
      />
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4, marginRight: 6 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={1}>
          {tool?.name ?? 'Tool'}
        </Text>
      </View>

      {toolQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : toolQuery.isError || !tool ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {toolQuery.error instanceof Error ? toolQuery.error.message : 'Failed to load this tool'}
          </Text>
          <Pressable
            onPress={() => toolQuery.refetch()}
            style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.tag, { color: colors.primary }]}>{tool.assetTag}</Text>
            <Text style={[styles.name, { color: colors.foreground }]}>{tool.name}</Text>
            <View style={styles.badgeRow}>
              <Chip
                label={(CONDITIONS.find((c) => c.key === tool.condition) ?? CONDITIONS[0]).label}
                color={(CONDITIONS.find((c) => c.key === tool.condition) ?? CONDITIONS[0]).color}
              />
              {SERVICE_META[tool.serviceState] ? (
                <Chip label={SERVICE_META[tool.serviceState]!.label} color={SERVICE_META[tool.serviceState]!.color} />
              ) : null}
            </View>
            {tool.category ? <Row colors={colors} icon="grid" label="Category" value={tool.category} /> : null}
            {tool.manufacturer || tool.model ? (
              <Row colors={colors} icon="package" label="Model" value={[tool.manufacturer, tool.model].filter(Boolean).join(' ')} />
            ) : null}
            {tool.serialNumber ? <Row colors={colors} icon="hash" label="Serial" value={tool.serialNumber} /> : null}
            {tool.nextServiceDue ? <Row colors={colors} icon="calendar" label="Next service" value={fmt(tool.nextServiceDue)} /> : null}
          </View>

          {tool.currentAssignment ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>IN CUSTODY</Text>
              <Row colors={colors} icon="user" label="Held by" value={tool.currentAssignment.holder} />
              <Row colors={colors} icon="clock" label="Since" value={fmt(tool.currentAssignment.since)} />
              {tool.currentAssignment.expectedReturnDate ? (
                <Row colors={colors} icon="corner-up-left" label="Expected back" value={fmt(tool.currentAssignment.expectedReturnDate)} />
              ) : null}
              {tool.currentAssignment.workOrderNumber ? (
                <Row colors={colors} icon="briefcase" label="On job" value={tool.currentAssignment.workOrderNumber} />
              ) : null}
            </View>
          ) : null}

          {/* Report condition */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>REPORT CONDITION</Text>
            <View style={styles.condRow}>
              {CONDITIONS.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setCondition(c.key)}
                  style={[
                    styles.condBtn,
                    { borderColor: condition === c.key ? c.color : colors.border, backgroundColor: condition === c.key ? c.color + '22' : 'transparent' },
                  ]}
                >
                  <Text style={{ color: condition === c.key ? c.color : colors.foreground, fontSize: 13, fontWeight: '600' }}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={[styles.noteInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {error ? <Text style={{ color: colors.destructive, fontSize: 13, marginTop: 6 }}>{error}</Text> : null}
            <Pressable
              disabled={!condition || reportMutation.isPending}
              onPress={() => reportMutation.mutate()}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: colors.primary, opacity: !condition || reportMutation.isPending ? 0.5 : pressed ? 0.8 : 1 },
              ]}
            >
              {reportMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.submitText, { color: colors.primaryForeground }]}>Report condition</Text>
              )}
            </Pressable>
          </View>

          {/* History */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>RECENT HISTORY</Text>
            {tool.history.length === 0 ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No custody history yet.</Text>
            ) : (
              tool.history.map(renderHistory)
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  colors,
  icon,
  label,
  value,
}: {
  colors: ReturnType<typeof useColors>;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Feather name={icon} size={14} color={colors.mutedForeground} />
      <Text style={{ color: colors.mutedForeground, fontSize: 13, width: 96 }}>{label}</Text>
      <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, marginTop: 8 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 12, gap: 8 },
  tag: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  name: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  condRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  noteInput: { borderWidth: 1, borderRadius: 10, padding: 10, minHeight: 60, fontSize: 14, textAlignVertical: 'top' },
  submitBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
});
