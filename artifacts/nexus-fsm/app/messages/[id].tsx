/**
 * One conversation. Text only — there is no attachment path by design.
 *
 * New messages arrive by polling every 5 seconds with an incremental
 * `afterId` fetch, so the request stays tiny no matter how long the thread
 * gets. The read cursor is advanced whenever the newest visible message
 * changes, which is what clears the unread badge on the dashboard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  listMessages,
  markThreadRead,
  sendMessage,
  type ChatMessage,
} from '@/lib/fsm-api';

const POLL_MS = 5_000;

function timeStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return 'Today';
  const yest = new Date(now.getTime() - 86_400_000);
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MessageThreadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const threadId = parseInt(String(params.id ?? ''), 10);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState<string>(params.title ?? 'Conversation');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const lastIdRef = useRef(0);
  const readUpToRef = useRef(0);
  const atBottomRef = useRef(true);

  /** Merge by id so an optimistic send and the poll can't duplicate a row. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      const next = [...byId.values()].sort((a, b) => a.id - b.id);
      const newest = next[next.length - 1];
      if (newest) lastIdRef.current = Math.max(lastIdRef.current, newest.id);
      return next;
    });
  }, []);

  // Initial page.
  useEffect(() => {
    if (!staff || !Number.isFinite(threadId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await listMessages(staff.id, threadId);
        if (cancelled) return;
        merge(res.messages);
        if (!params.title) setTitle(res.kind === 'job' ? 'Job conversation' : 'Office');
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load messages');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staff, threadId, merge, params.title]);

  // Incremental poll. Failures are silent — the next tick retries.
  useEffect(() => {
    if (!staff || !Number.isFinite(threadId)) return;
    const timer = setInterval(async () => {
      try {
        const res = await listMessages(staff.id, threadId, lastIdRef.current);
        merge(res.messages);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [staff, threadId, merge]);

  // Advance the read cursor as new messages come into view, and refresh the
  // inbox/badge counts so the dashboard clears.
  useEffect(() => {
    if (!staff || messages.length === 0) return;
    const newest = messages[messages.length - 1];
    if (!newest || newest.id <= readUpToRef.current) return;
    readUpToRef.current = newest.id;
    void markThreadRead(staff.id, threadId, newest.id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ['messaging-threads'] });
        void queryClient.invalidateQueries({ queryKey: ['messaging-unread'] });
      })
      .catch(() => {
        /* non-fatal */
      });
  }, [messages, staff, threadId, queryClient]);

  // Only auto-scroll when the user is already at the bottom, so reading back
  // through history isn't yanked away by an incoming message.
  useEffect(() => {
    if (atBottomRef.current) {
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !staff || sending) return;
    setSending(true);
    setDraft('');
    try {
      const msg = await sendMessage(staff.id, threadId, body);
      atBottomRef.current = true;
      merge([msg]);
      void queryClient.invalidateQueries({ queryKey: ['messaging-threads'] });
    } catch (e) {
      setDraft(body); // put it back so nothing is silently lost
      setError(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  let lastDay = '';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) + 12, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          testID="thread-back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>Text messages only</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            atBottomRef.current =
              layoutMeasurement.height + contentOffset.y >= contentSize.height - 60;
          }}
          scrollEventThrottle={100}
        >
          {messages.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Feather name="message-square" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No messages yet. Say something.
              </Text>
            </View>
          ) : null}

          {messages.map((m) => {
            const day = dayLabel(m.createdAt);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <View key={m.id}>
                {showDay ? (
                  <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{day}</Text>
                ) : null}
                <View
                  testID={`message-${m.id}`}
                  style={[
                    styles.bubble,
                    m.mine
                      ? { alignSelf: 'flex-end', backgroundColor: colors.primary }
                      : { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
                  ]}
                >
                  {!m.mine ? (
                    <Text style={[styles.sender, { color: colors.primary }]}>
                      {m.senderName}
                      {m.senderSide === 'office' ? ' · Office' : ''}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.bubbleText,
                      { color: m.mine ? colors.primaryForeground : colors.foreground },
                    ]}
                  >
                    {m.body}
                  </Text>
                  <Text
                    style={[
                      styles.bubbleTime,
                      { color: m.mine ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {timeStamp(m.createdAt)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {error ? (
        <Text style={[styles.errorText, { color: colors.destructive }]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      <View
        style={[
          styles.composer,
          {
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 10,
          },
        ]}
      >
        <TextInput
          testID="message-input"
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={4000}
          style={[
            styles.input,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          ]}
        />
        <Pressable
          testID="message-send"
          onPress={send}
          disabled={!draft.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            {
              backgroundColor: draft.trim() && !sending ? colors.primary : colors.muted,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather
              name="send"
              size={18}
              color={draft.trim() ? colors.primaryForeground : colors.mutedForeground}
            />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyBlock: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 12 },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  dayLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
    marginVertical: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8 },
  sender: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  bubbleText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  bubbleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3, alignSelf: 'flex-end', opacity: 0.8 },
  errorText: { fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 16, paddingBottom: 6 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
