import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriorityChip, StatusChip, formatDate } from '@/components/JobBits';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { acceptJob, declineJob, getJob, type FsmJobHistory, type FsmJobNote } from '@/lib/fsm-api';

const DECLINE_REASONS = [
  'Not available at that time',
  'Location is too far',
  'Missing parts or tools',
  'Outside my skill set',
  'Other',
];

function Row({ icon, label, value, onPress }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <Feather name={icon} size={16} color={colors.mutedForeground} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.rowValue, { color: onPress ? colors.accent : colors.foreground }]}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

export default function JobDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { staff } = useStaff();
  const params = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(String(params.id), 10);

  const [declineOpen, setDeclineOpen] = useState(false);

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  const jobQuery = useQuery({
    queryKey: ['fsm-job', staff?.id, jobId],
    queryFn: () => getJob(staff!.id, jobId),
    enabled: !!staff && Number.isInteger(jobId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['fsm-jobs'] });
    void queryClient.invalidateQueries({ queryKey: ['fsm-job', staff?.id, jobId] });
  };

  const acceptMutation = useMutation({
    mutationFn: () => acceptJob(staff!.id, jobId),
    onSuccess: () => {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      invalidate();
    },
  });

  const declineMutation = useMutation({
    mutationFn: (reason: string) => declineJob(staff!.id, jobId, reason),
    onSuccess: () => {
      setDeclineOpen(false);
      invalidate();
    },
  });

  const job = jobQuery.data;
  const busy = acceptMutation.isPending || declineMutation.isPending;
  const mutationError =
    (acceptMutation.error instanceof Error ? acceptMutation.error.message : null) ??
    (declineMutation.error instanceof Error ? declineMutation.error.message : null);

  const notes: FsmJobNote[] = Array.isArray(job?.notes) ? (job.notes as FsmJobNote[]) : [];
  const history: FsmJobHistory[] = Array.isArray(job?.history) ? job.history : [];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + webTop + 10, borderBottomColor: colors.border }]}>
        <Pressable
          testID="back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {job?.workOrderNumber ?? 'Job'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {jobQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : jobQuery.isError || !job ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {jobQuery.error instanceof Error ? jobQuery.error.message : 'Job not found'}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + webBottom + 120 }}
          >
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chipsRow}>
                <StatusChip status={job.status} />
                <PriorityChip priority={job.priority} />
                {job.assignmentStatus === 'accepted' ? (
                  <View style={[styles.acceptedBadge, { backgroundColor: '#22C55E22' }]}>
                    <Feather name="check" size={12} color="#22C55E" />
                    <Text style={styles.acceptedText}>Accepted</Text>
                  </View>
                ) : job.assignmentStatus === 'declined' ? (
                  <View style={[styles.acceptedBadge, { backgroundColor: '#EF444422' }]}>
                    <Feather name="x" size={12} color="#EF4444" />
                    <Text style={[styles.acceptedText, { color: '#EF4444' }]}>Declined</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.title, { color: colors.foreground }]}>{job.itemDescription}</Text>
              {(job.brand || job.model) ? (
                <Text style={[styles.subtle, { color: colors.mutedForeground }]}>
                  {[job.brand, job.model].filter(Boolean).join(' ')}
                  {job.serialNumber ? ` · SN ${job.serialNumber}` : ''}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>PROBLEM</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.body, { color: colors.foreground }]}>{job.problemDescription}</Text>
              {job.diagnosis ? (
                <>
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground, marginTop: 10 }]}>Diagnosis</Text>
                  <Text style={[styles.body, { color: colors.foreground }]}>{job.diagnosis}</Text>
                </>
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CUSTOMER</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row icon="user" label="Name" value={job.customerName ?? 'Walk-in'} />
              {job.contactPhone ? (
                <Row
                  icon="phone"
                  label="Phone"
                  value={job.contactPhone}
                  onPress={() => void Linking.openURL(`tel:${job.contactPhone}`)}
                />
              ) : null}
              {job.contactEmail ? (
                <Row
                  icon="mail"
                  label="Email"
                  value={job.contactEmail}
                  onPress={() => void Linking.openURL(`mailto:${job.contactEmail}`)}
                />
              ) : null}
            </View>

            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SCHEDULE</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Row icon="calendar" label="Appointment" value={formatDate(job.appointmentDate)} />
              <Row icon="flag" label="Promised by" value={formatDate(job.promisedDate)} />
              <Row icon="map-pin" label="Service channel" value={job.serviceChannel.replace(/_/g, ' ')} />
              {job.storageLocation ? (
                <Row icon="box" label="Item location" value={job.storageLocation} />
              ) : null}
            </View>

            {job.declineReason && job.assignmentStatus === 'declined' ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DECLINE REASON</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.body, { color: colors.foreground }]}>{job.declineReason}</Text>
                </View>
              </>
            ) : null}

            {notes.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>NOTES</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {notes.map((n) => (
                    <View key={n.id} style={styles.noteRow}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                        {n.authorName ?? 'Staff'} · {formatDate(n.createdAt)}
                      </Text>
                      <Text style={[styles.body, { color: colors.foreground }]}>{n.content}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {history.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>HISTORY</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {history.map((h) => (
                    <View key={h.id} style={styles.noteRow}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                        {formatDate(h.createdAt)} · {h.changedByName ?? 'System'}
                      </Text>
                      <Text style={[styles.body, { color: colors.foreground }]}>
                        {h.note ?? `${h.fromStatus ?? '—'} → ${h.toStatus}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {mutationError ? (
              <Text style={[styles.error, { color: colors.destructive }]}>{mutationError}</Text>
            ) : null}
          </ScrollView>

          {job.assignmentStatus !== 'accepted' ? (
            <View
              style={[
                styles.actionBar,
                {
                  backgroundColor: colors.background,
                  borderTopColor: colors.border,
                  paddingBottom: insets.bottom + webBottom + 12,
                },
              ]}
            >
              <Pressable
                testID="decline-button"
                onPress={() => setDeclineOpen(true)}
                disabled={busy}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.destructive,
                    borderWidth: 1,
                    opacity: pressed || busy ? 0.7 : 1,
                  },
                ]}
              >
                <Feather name="x" size={18} color={colors.destructive} />
                <Text style={[styles.actionText, { color: colors.destructive }]}>Decline</Text>
              </Pressable>
              <Pressable
                testID="accept-button"
                onPress={() => acceptMutation.mutate()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.actionButton,
                  { backgroundColor: colors.primary, opacity: pressed || busy ? 0.7 : 1 },
                ]}
              >
                {acceptMutation.isPending ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <>
                    <Feather name="check" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.actionText, { color: colors.primaryForeground }]}>
                      Accept Job
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : null}
        </>
      )}

      <Modal visible={declineOpen} transparent animationType="fade" onRequestClose={() => setDeclineOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDeclineOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Why are you declining?</Text>
            {DECLINE_REASONS.map((reason) => (
              <Pressable
                key={reason}
                testID={`decline-reason-${reason}`}
                disabled={declineMutation.isPending}
                onPress={() => declineMutation.mutate(reason)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  { backgroundColor: pressed ? colors.secondary : 'transparent', borderColor: colors.border },
                ]}
              >
                <Text style={[styles.reasonText, { color: colors.foreground }]}>{reason}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
            {declineMutation.isPending ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  acceptedText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#22C55E' },
  title: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  subtle: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
  },
  body: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  rowLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  rowValue: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  noteRow: { paddingVertical: 6, gap: 3 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 14, textAlign: 'center' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  actionText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 18 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  reasonText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
});
