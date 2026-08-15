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
import { getUnreadCount, isAdminRole, listJobs, type FsmJob } from '@/lib/fsm-api';

/** Warning triangle (issues & exceptions) and money-collectible colours. */
const EXCEPTION_COLOR = '#F59E0B';
const MONEY_COLOR = '#22C55E';

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;

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

  // Unread badge. Polled slowly — the thread screen polls fast while open.
  const unreadQuery = useQuery({
    queryKey: ['messaging-unread', staff?.id],
    queryFn: () => getUnreadCount(staff!.id),
    enabled: !!token && !!staff,
    refetchInterval: 30_000,
    // Messaging rides on the Work Orders add-on; if it's off, just hide the badge.
    retry: false,
  });
  const unread = unreadQuery.data?.unreadCount ?? 0;

  const admin = isAdminRole(staff?.role);

  const sections = useMemo(() => {
    const all = jobsQuery.data ?? [];
    /**
     * Finished work is kept apart from live work. Technicians only ever receive
     * a finished job while tools are still signed out on it; office roles get
     * the whole history, parked at the bottom.
     */
    const finished = all.filter(
      (j) => !!j.workCompletedAt || j.status === 'collected' || j.status === 'cancelled',
    );
    const jobs = all.filter((j) => !finished.includes(j));
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
    if (finished.length) {
      out.push({ title: admin ? 'Completed & closed' : 'Awaiting tool return', data: finished });
    }
    return out;
  }, [jobsQuery.data, admin]);

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
        <Text
          style={[
            styles.woNumber,
            { color: colors.primary, textShadowColor: 'rgba(45, 212, 191, 0.55)' },
          ]}
          numberOfLines={1}
        >
          {item.workOrderNumber}
        </Text>
        <View style={styles.cardFlags}>
          {item.exceptions?.length ? (
            <Feather
              testID={`job-exception-${item.id}`}
              name="alert-triangle"
              size={16}
              color={EXCEPTION_COLOR}
            />
          ) : null}
          {item.amountDue > 0 ? (
            <Feather
              testID={`job-money-${item.id}`}
              name="dollar-sign"
              size={16}
              color={MONEY_COLOR}
            />
          ) : null}
          <PriorityChip priority={item.priority} />
        </View>
      </View>
      <Text
        style={[
          styles.customerName,
          { color: colors.foreground, textShadowColor: 'rgba(244, 247, 251, 0.35)' },
        ]}
        numberOfLines={1}
      >
        {item.customerName ?? 'Walk-in'}
      </Text>
      <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
        {item.itemDescription}
      </Text>
      <Text style={[styles.cardProblem, { color: colors.mutedForeground }]} numberOfLines={2}>
        {item.problemDescription}
      </Text>
      {item.exceptions?.length || item.amountDue > 0 ? (
        <View style={styles.cardAlerts}>
          {item.exceptions?.length ? (
            <View style={styles.cardMeta}>
              <Feather name="alert-triangle" size={12} color={EXCEPTION_COLOR} />
              <Text style={[styles.alertText, { color: EXCEPTION_COLOR }]} numberOfLines={1}>
                {item.exceptions.join(' · ')}
              </Text>
            </View>
          ) : null}
          {item.amountDue > 0 ? (
            <View style={styles.cardMeta}>
              <Feather name="dollar-sign" size={12} color={MONEY_COLOR} />
              <Text style={[styles.alertText, { color: MONEY_COLOR }]}>
                {money(item.amountDue)} to collect
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.cardBottom}>
        <StatusChip status={item.status} serviceChannel={item.serviceChannel} />
        {item.assignedTeamName ? (
          <Chip label={item.assignedTeamName} color={colors.accent} />
        ) : null}
        {item.assignmentStatus === 'accepted' && item.fieldPhase !== 'idle' ? (
          <Chip
            label={item.fieldPhase === 'en_route' ? 'EN ROUTE' : item.fieldPhase === 'on_site' ? 'ON SITE' : 'WORK DONE'}
            color={item.fieldPhase === 'done' ? '#22C55E' : colors.accent}
          />
        ) : null}
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
          testID="messages-button"
          onPress={() => router.push('/messages')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: unread > 0 ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1, marginRight: 8 },
          ]}
        >
          <Feather name="message-square" size={18} color={colors.foreground} />
          {unread > 0 ? (
            <View testID="messages-badge" style={[styles.iconBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              <Text style={[styles.iconBadgeText, { color: colors.primaryForeground }]}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </Pressable>
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
        <Pressable
          testID="tools-button"
          onPress={() => router.push('/tools')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1, marginRight: 8 },
          ]}
        >
          <Feather name="tool" size={18} color={colors.foreground} />
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
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
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
  cardFlags: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardAlerts: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  alertText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  woNumber: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
    flexShrink: 1,
    marginRight: 8,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  customerName: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  cardProblem: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  metaText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
