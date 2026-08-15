/**
 * Messages inbox — conversations between this technician and the office.
 *
 * Technicians always get an "Office" row (the thread is created the first
 * time it is opened) plus a row per job conversation they are part of.
 * Admins/managers signed into the FSM app are the office side, so they see
 * every conversation in the business instead.
 *
 * Delivery is by polling: there is no push channel in the Expo Go build.
 */
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  isAdminRole,
  listThreads,
  openDirectThread,
  type MessageThreadSummary,
} from '@/lib/fsm-api';

/** "2:45 PM" today, "Mon" this week, else "12 Aug". */
function relativeStamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function MessagesInboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { staff } = useStaff();
  const queryClient = useQueryClient();

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;
  const isOffice = isAdminRole(staff?.role);

  const threadsQuery = useQuery({
    queryKey: ['messaging-threads', staff?.id],
    queryFn: () => listThreads(staff!.id),
    enabled: !!token && !!staff,
    refetchInterval: 15_000,
  });

  const threads = threadsQuery.data?.threads ?? [];

  // A technician's own office thread is pinned to the top as a fixed row, so
  // it is reachable even before the first message exists.
  const officeThread = useMemo(
    () => threads.find((t) => t.kind === 'direct' && t.staffId === staff?.id) ?? null,
    [threads, staff?.id],
  );
  const otherThreads = useMemo(
    () => threads.filter((t) => t.id !== officeThread?.id),
    [threads, officeThread],
  );

  const openOffice = useMutation({
    mutationFn: () => openDirectThread(staff!.id, staff!.id),
    onSuccess: (t) => router.push(`/messages/${t.id}`),
  });

  const Row = ({
    title,
    subtitle,
    preview,
    stamp,
    unread,
    icon,
    onPress,
    testID,
  }: {
    title: string;
    subtitle?: string | null;
    preview?: string | null;
    stamp?: string;
    unread: number;
    icon: React.ComponentProps<typeof Feather>['name'];
    onPress: () => void;
    testID: string;
  }) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.card,
          borderColor: unread > 0 ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
          {stamp ? (
            <Text style={[styles.stamp, { color: colors.mutedForeground }]}>{stamp}</Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.preview,
              { color: unread > 0 ? colors.foreground : colors.mutedForeground },
            ]}
            numberOfLines={1}
          >
            {preview || 'No messages yet'}
          </Text>
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + webTop + 12, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          testID="messages-back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Messages</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            {isOffice ? 'All conversations' : 'Office & job chats'}
          </Text>
        </View>
      </View>

      {threadsQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : threadsQuery.isError ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {threadsQuery.error instanceof Error
              ? threadsQuery.error.message
              : 'Failed to load messages'}
          </Text>
          <Pressable
            onPress={() => threadsQuery.refetch()}
            style={({ pressed }) => [
              styles.retryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.retryText, { color: colors.primaryForeground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + webBottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={threadsQuery.isFetching && !threadsQuery.isLoading}
              onRefresh={() => {
                void queryClient.invalidateQueries({ queryKey: ['messaging-threads'] });
              }}
              tintColor={colors.primary}
            />
          }
        >
          {!isOffice ? (
            <Row
              testID="thread-office"
              title="Office"
              subtitle="Dispatch & management"
              preview={officeThread?.lastMessagePreview}
              stamp={relativeStamp(officeThread?.lastMessageAt ?? null)}
              unread={officeThread?.unreadCount ?? 0}
              icon="home"
              onPress={() => {
                if (officeThread) router.push(`/messages/${officeThread.id}`);
                else if (!openOffice.isPending) openOffice.mutate();
              }}
            />
          ) : null}

          {otherThreads.length === 0 && (isOffice || !officeThread) ? (
            <View style={styles.emptyBlock}>
              <Feather name="message-square" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isOffice
                  ? 'No conversations yet. Start one from a job or from the office app.'
                  : 'Job chats appear here once you or the office start one from a job.'}
              </Text>
            </View>
          ) : null}

          {otherThreads.map((t: MessageThreadSummary) => (
            <Row
              key={t.id}
              testID={`thread-${t.id}`}
              title={t.title}
              subtitle={
                t.kind === 'job'
                  ? [t.customerName, t.workOrderItem].filter(Boolean).join(' · ') || null
                  : 'Direct message'
              }
              preview={
                t.lastMessagePreview
                  ? `${t.lastMessageSenderName ? `${t.lastMessageSenderName}: ` : ''}${t.lastMessagePreview}`
                  : null
              }
              stamp={relativeStamp(t.lastMessageAt)}
              unread={t.unreadCount}
              icon={t.kind === 'job' ? 'tool' : 'user'}
              onPress={() => router.push(`/messages/${t.id}`)}
            />
          ))}
        </ScrollView>
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { paddingRight: 8, paddingVertical: 4 },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  retryButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  stamp: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  rowSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  preview: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
});
