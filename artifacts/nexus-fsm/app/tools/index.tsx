/**
 * My Tools — the fixed-asset tools currently signed out to this technician or
 * to a team they belong to. Tools are handed back through the signed material
 * return on the job they went out on; from here the technician can flag a
 * tool's condition and see what it's out on.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip } from '@/components/JobBits';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  listMyTools,
  type FsmTool,
  type ToolCondition,
  type ToolScope,
  type ToolServiceState,
} from '@/lib/fsm-api';

const CONDITION_META: Record<ToolCondition, { label: string; color: string }> = {
  good: { label: 'Good', color: '#22C55E' },
  fair: { label: 'Fair', color: '#F59E0B' },
  needs_repair: { label: 'Needs repair', color: '#F97316' },
  out_of_service: { label: 'Out of service', color: '#EF4444' },
};

const SERVICE_META: Partial<Record<ToolServiceState, { label: string; color: string }>> = {
  due_soon: { label: 'Service due soon', color: '#F59E0B' },
  overdue: { label: 'Service overdue', color: '#EF4444' },
};

const SCOPES: { key: ToolScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
  { key: 'team', label: 'Team' },
];

function since(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MyToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();

  const [scope, setScope] = useState<ToolScope>('all');

  const toolsQuery = useQuery({
    queryKey: ['fsm-tools', staff?.id, scope],
    queryFn: () => listMyTools(staff!.id, scope),
    enabled: !!staff,
    refetchInterval: 60_000,
  });

  const renderTool = ({ item }: { item: FsmTool }) => {
    const cond = CONDITION_META[item.condition] ?? CONDITION_META.good;
    const svc = SERVICE_META[item.serviceState];
    return (
      <Pressable
        testID={`tool-card-${item.id}`}
        onPress={() => router.push(`/tools/${item.id}`)}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={styles.cardTop}>
          <Text style={[styles.tag, { color: colors.primary }]} numberOfLines={1}>
            {item.assetTag}
          </Text>
          {item.heldByMe ? (
            <Chip label="MINE" color={colors.primary} />
          ) : (
            <Chip label={item.holder} color={colors.accent} />
          )}
        </View>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.category ? (
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.category}
          </Text>
        ) : null}
        <View style={styles.badgeRow}>
          <Chip label={cond.label} color={cond.color} />
          {svc ? <Chip label={svc.label} color={svc.color} /> : null}
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.metaRow}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              Since {since(item.since)}
            </Text>
          </View>
          {item.workOrderNumber ? (
            <View style={styles.metaRow}>
              <Feather name="briefcase" size={12} color={colors.mutedForeground} />
              <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                {item.workOrderNumber}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4, marginRight: 6 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>My Tools</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>{staff?.name}</Text>
        </View>
      </View>

      <View style={[styles.scopeRow, { borderBottomColor: colors.border }]}>
        {SCOPES.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setScope(s.key)}
            style={[
              styles.scopeBtn,
              {
                backgroundColor: scope === s.key ? colors.primary : 'transparent',
                borderColor: scope === s.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text style={{ color: scope === s.key ? colors.primaryForeground : colors.foreground, fontSize: 13, fontWeight: '600' }}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {toolsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : toolsQuery.isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {toolsQuery.error instanceof Error ? toolsQuery.error.message : 'Failed to load tools'}
          </Text>
          <Pressable
            onPress={() => toolsQuery.refetch()}
            style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (toolsQuery.data ?? []).length === 0 ? (
        <View style={styles.center}>
          <Feather name="tool" size={32} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No tools out</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {scope === 'mine'
              ? "You aren't holding any tools right now"
              : scope === 'team'
                ? 'Your team isn’t holding any tools right now'
                : 'No tools are signed out to you or your team'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={toolsQuery.data ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTool}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={toolsQuery.isRefetching}
              onRefresh={() => toolsQuery.refetch()}
              tintColor={colors.primary}
            />
          }
        />
      )}
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
  title: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  sub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  scopeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  scopeBtn: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, marginTop: 8 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tag: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 0.3, flexShrink: 1 },
  name: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular', flexShrink: 1 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
});
