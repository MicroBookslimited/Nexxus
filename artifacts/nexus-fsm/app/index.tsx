import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, PriorityChip, StatusChip, formatDate, isToday } from '@/components/JobBits';
import { useAuth } from '@/context/AuthContext';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { isAdminRole, listJobs, type FsmJob } from '@/lib/fsm-api';

export default function JobQueueScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { staff, clearStaff } = useStaff();

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  const jobsQuery = useQuery({
    queryKey: ['fsm-jobs', staff?.id],
    queryFn: () => listJobs(staff!.id),
    enabled: !!token && !!staff,
    refetchInterval: 60_000,
  });

  const sections = useMemo(() => {
    const jobs = jobsQuery.data ?? [];
    const pending = jobs.filter((j) => j.assignmentStatus === 'pending');
    const accepted = jobs.filter((j) => j.assignmentStatus === 'accepted');
    const declined = jobs.filter((j) => j.assignmentStatus === 'declined');
    const inProgress = accepted.filter((j) =>
      ['in_progress', 'awaiting_parts', 'on_hold'].includes(j.status),
    );
    const rest = accepted.filter((j) => !inProgress.includes(j));
    const today = rest.filter((j) => isToday(j.appointmentDate ?? j.promisedDate));
    const upcoming = rest.filter((j) => !today.includes(j));

    const out: Array<{ title: string; data: FsmJob[] }> = [];
    if (pending.length) out.push({ title: 'New — respond', data: pending });
    if (today.length) out.push({ title: 'Today', data: today });
    if (inProgress.length) out.push({ title: 'In progress', data: inProgress });
    if (upcoming.length) out.push({ title: 'Upcoming', data: upcoming });
    if (declined.length) out.push({ title: 'Declined', data: declined });
    return out;
  }, [jobsQuery.data]);

  const renderJob = ({ item }: { item: FsmJob }) => (
    <Pressable
      testID={`job-card-${item.id}`}
      onPress={() => router.push(`/job/${item.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor:
            item.assignmentStatus === 'pending' ? colors.accent : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.woNumber, { color: colors.mutedForeground }]}>
          {item.workOrderNumber}
        </Text>
        <PriorityChip priority={item.priority} />
      </View>
      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
        {item.itemDescription}
      </Text>
      <Text style={[styles.cardProblem, { color: colors.mutedForeground }]} numberOfLines={2}>
        {item.problemDescription}
      </Text>
      <View style={styles.cardBottom}>
        <StatusChip status={item.status} serviceChannel={item.serviceChannel} />
        {item.assignmentStatus === 'accepted' && item.fieldPhase !== 'idle' ? (
          <Chip
            label={item.fieldPhase === 'en_route' ? 'EN ROUTE' : item.fieldPhase === 'on_site' ? 'ON SITE' : 'WORK DONE'}
            color={item.fieldPhase === 'done' ? '#22C55E' : colors.accent}
          />
        ) : null}
        <View style={styles.cardMeta}>
          <Feather name="user" size={12} color={colors.mutedForeground} />
          <Text style={[styles.metaText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {item.customerName ?? 'Walk-in'}
          </Text>
        </View>
        {(item.appointmentDate ?? item.promisedDate) ? (
          <View style={styles.cardMeta}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
              {formatDate(item.appointmentDate ?? item.promisedDate)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTop + 12, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            {isAdminRole(staff?.role) ? 'All Jobs' : 'My Jobs'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {staff?.name}{isAdminRole(staff?.role) ? ' · Admin' : ''}
          </Text>
        </View>
        <Pressable
          testID="shift-button"
          onPress={() => router.push('/shift')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginRight: 8 },
          ]}
        >
          <Feather name="dollar-sign" size={18} color={colors.foreground} />
        </Pressable>
        <Pressable
          testID="calendar-button"
          onPress={() => router.push('/calendar')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginRight: 8 },
          ]}
        >
          <Feather name="calendar" size={18} color={colors.foreground} />
        </Pressable>
        {isAdminRole(staff?.role) ? (
          <Pressable
            testID="create-job-button"
            onPress={() => router.push('/create-job')}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.primary, borderColor: colors.primary, opacity: pressed ? 0.7 : 1, marginRight: 8 },
            ]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          testID="switch-staff-button"
          onPress={clearStaff}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {jobsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : jobsQuery.isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {jobsQuery.error instanceof Error ? jobsQuery.error.message : 'Failed to load jobs'}
          </Text>
          <Pressable
            onPress={() => jobsQuery.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <Feather name="check-circle" size={32} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No jobs assigned to you right now
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderJob}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
              {section.title.toUpperCase()}
            </Text>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + webBottom + 24 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={jobsQuery.isRefetching}
              onRefresh={() => jobsQuery.refetch()}
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
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryButton: { borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, marginTop: 8 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  woNumber: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  cardProblem: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
