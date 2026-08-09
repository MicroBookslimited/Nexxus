import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriorityChip, StatusChip, formatDate } from '@/components/JobBits';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import SignaturePad, { strokesToSvgDataUrl } from '@/components/SignaturePad';
import {
  acceptJob,
  addJobNote,
  addJobPhoto,
  arriveOnSite,
  completeJob,
  declineJob,
  deleteJobPhoto,
  getJob,
  pauseJob,
  resumeJob,
  startTravel,
  submitSignature,
  type FsmJobHistory,
  type FsmJobNote,
} from '@/lib/fsm-api';

const DECLINE_REASONS = [
  'Not available at that time',
  'Location is too far',
  'Missing parts or tools',
  'Outside my skill set',
  'Other',
];

const PAUSE_REASONS = ['Break', 'Waiting for parts', 'Waiting for customer', 'Other job interruption'];

function notify(kind: 'success' | 'error') {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  }
}

function fmtDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

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

/** Live billable timer: closed work minutes + elapsed time of the open work entry. */
function useLiveMinutes(billableMinutes: number | undefined, activeEntry: { entryType: string; startedAt: string } | null | undefined) {
  const [, setTick] = useState(0);
  const running = activeEntry?.entryType === 'work';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [running]);
  const base = billableMinutes ?? 0;
  if (!running || !activeEntry) return base;
  return base + Math.max(0, (Date.now() - new Date(activeEntry.startedAt).getTime()) / 60000);
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
  const [pauseOpen, setPauseOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [completeSheetOpen, setCompleteSheetOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState('');
  const signRef = useRef<{ strokes: { x: number; y: number }[][]; size: { width: number; height: number } }>({
    strokes: [],
    size: { width: 0, height: 0 },
  });

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

  const mutationOpts = {
    onSuccess: () => { notify('success'); invalidate(); },
    onError: () => notify('error'),
  };

  const acceptMutation = useMutation({ mutationFn: () => acceptJob(staff!.id, jobId), ...mutationOpts });
  const declineMutation = useMutation({
    mutationFn: (reason: string) => declineJob(staff!.id, jobId, reason),
    onSuccess: () => { setDeclineOpen(false); invalidate(); },
    onError: () => notify('error'),
  });
  const travelMutation = useMutation({ mutationFn: () => startTravel(staff!.id, jobId), ...mutationOpts });
  const arriveMutation = useMutation({ mutationFn: () => arriveOnSite(staff!.id, jobId), ...mutationOpts });
  const pauseMutation = useMutation({
    mutationFn: (reason: string) => pauseJob(staff!.id, jobId, reason),
    onSuccess: () => { setPauseOpen(false); notify('success'); invalidate(); },
    onError: () => notify('error'),
  });
  const resumeMutation = useMutation({ mutationFn: () => resumeJob(staff!.id, jobId), ...mutationOpts });
  const completeMutation = useMutation({ mutationFn: () => completeJob(staff!.id, jobId), ...mutationOpts });
  const noteMutation = useMutation({
    mutationFn: (content: string) => addJobNote(staff!.id, jobId, content),
    onSuccess: () => { setNoteOpen(false); setNoteText(''); notify('success'); invalidate(); },
    onError: () => notify('error'),
  });
  const photoMutation = useMutation({
    mutationFn: (image: string) => addJobPhoto(staff!.id, jobId, image),
    ...mutationOpts,
  });
  const photoDeleteMutation = useMutation({
    mutationFn: (photoId: number) => deleteJobPhoto(staff!.id, jobId, photoId),
    ...mutationOpts,
  });
  const signatureMutation = useMutation({
    mutationFn: ({ image, signedBy }: { image: string; signedBy: string }) =>
      submitSignature(staff!.id, jobId, image, signedBy),
    // Signature saved — close the modal and complete as a separate step so a
    // completion failure is recoverable (the Complete button retries directly).
    onSuccess: () => {
      setSignOpen(false);
      setSignName('');
      notify('success');
      invalidate();
      completeMutation.mutate();
    },
    onError: () => { notify('error'); invalidate(); },
  });

  const pickPhoto = async (fromCamera: boolean) => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.35,
      base64: true,
      allowsMultipleSelection: false,
    };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;
    photoMutation.mutate(`data:image/jpeg;base64,${asset.base64}`);
  };

  const job = jobQuery.data;
  const liveMinutes = useLiveMinutes(job?.billableMinutes, job?.activeEntry);
  const busy =
    acceptMutation.isPending || declineMutation.isPending || travelMutation.isPending ||
    arriveMutation.isPending || pauseMutation.isPending || resumeMutation.isPending ||
    completeMutation.isPending;
  const mutationError = [acceptMutation, declineMutation, travelMutation, arriveMutation, pauseMutation, resumeMutation, completeMutation, noteMutation, photoMutation, photoDeleteMutation, signatureMutation]
    .map((m) => (m.error instanceof Error ? m.error.message : null))
    .find(Boolean) ?? null;

  const notes: FsmJobNote[] = Array.isArray(job?.notes) ? (job.notes as FsmJobNote[]) : [];
  const history: FsmJobHistory[] = Array.isArray(job?.history) ? job.history : [];
  const isClosed = job ? job.status === 'collected' || job.status === 'cancelled' : false;
  const isPaused = job?.activeEntry != null && job.activeEntry.entryType !== 'work';
  const phase = job?.fieldPhase ?? 'idle';
  const showExec = job && job.assignmentStatus === 'accepted' && !isClosed;

  const primaryBtn = (label: string, icon: keyof typeof Feather.glyphMap, onPress: () => void, pending: boolean, testID: string, color?: string) => (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.actionButton,
        { backgroundColor: color ?? colors.primary, opacity: pressed || busy ? 0.7 : 1 },
      ]}
    >
      {pending ? (
        <ActivityIndicator color={colors.primaryForeground} />
      ) : (
        <>
          <Feather name={icon} size={18} color={color ? '#FFFFFF' : colors.primaryForeground} />
          <Text style={[styles.actionText, { color: color ? '#FFFFFF' : colors.primaryForeground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );

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
            contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + webBottom + 140 }}
          >
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.chipsRow}>
                <StatusChip status={job.status} serviceChannel={job.serviceChannel} />
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

            {showExec && phase !== 'idle' ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>JOB TIME</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.timerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.timerValue, { color: phase === 'done' ? colors.foreground : isPaused ? colors.warning : colors.primary }]}>
                        {fmtDuration(liveMinutes)}
                      </Text>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                        {phase === 'done'
                          ? 'Billable time (completed)'
                          : isPaused
                            ? `Paused — ${job.activeEntry?.pauseReason ?? ''}`
                            : phase === 'on_site'
                              ? 'Billable time — clock running'
                              : 'En route'}
                      </Text>
                    </View>
                    {phase === 'on_site' ? (
                      <Feather
                        name={isPaused ? 'pause-circle' : 'clock'}
                        size={28}
                        color={isPaused ? colors.warning : colors.primary}
                      />
                    ) : null}
                  </View>
                  {(job.pausedMinutes ?? 0) > 0 ? (
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      Paused total: {fmtDuration(job.pausedMinutes)} (not billed)
                    </Text>
                  ) : null}
                  {job.travelStartedAt ? (
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      Travel started {formatDate(job.travelStartedAt)}
                      {job.arrivedAt ? ` · Arrived ${formatDate(job.arrivedAt)}` : ''}
                      {job.workCompletedAt ? ` · Completed ${formatDate(job.workCompletedAt)}` : ''}
                    </Text>
                  ) : job.arrivedAt ? (
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      Arrived {formatDate(job.arrivedAt)}
                      {job.workCompletedAt ? ` · Completed ${formatDate(job.workCompletedAt)}` : ''}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : null}

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

            {(showExec || (job.photos?.length ?? 0) > 0) ? (
              <>
                <View style={styles.notesHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>PHOTOS</Text>
                  {showExec && !job.workCompletedAt ? (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        testID="take-photo-button"
                        onPress={() => void pickPhoto(true)}
                        disabled={photoMutation.isPending}
                        style={({ pressed }) => [styles.addNoteBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Feather name="camera" size={13} color={colors.primary} />
                        <Text style={[styles.addNoteText, { color: colors.primary }]}>Camera</Text>
                      </Pressable>
                      <Pressable
                        testID="pick-photo-button"
                        onPress={() => void pickPhoto(false)}
                        disabled={photoMutation.isPending}
                        style={({ pressed }) => [styles.addNoteBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Feather name="image" size={13} color={colors.primary} />
                        <Text style={[styles.addNoteText, { color: colors.primary }]}>Library</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {photoMutation.isPending ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : null}
                  {(job.photos?.length ?? 0) === 0 && !photoMutation.isPending ? (
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      No photos yet — capture before/after shots as proof of work
                    </Text>
                  ) : (
                    <View style={styles.photoGrid}>
                      {job.photos?.map((p) => (
                        <View key={p.id} style={styles.photoWrap}>
                          <Image source={{ uri: p.data }} style={styles.photo} contentFit="cover" />
                          {!job.workCompletedAt && p.staffId === staff?.id ? (
                            <Pressable
                              testID={`delete-photo-${p.id}`}
                              onPress={() => photoDeleteMutation.mutate(p.id)}
                              style={[styles.photoDelete, { backgroundColor: colors.destructive }]}
                            >
                              <Feather name="x" size={12} color="#FFFFFF" />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            ) : null}

            {job.completionSignedAt ? (
              <>
                <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CUSTOMER SIGN-OFF</Text>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {job.completionSignature ? (
                    <Image
                      source={{ uri: job.completionSignature }}
                      style={styles.signatureImage}
                      contentFit="contain"
                    />
                  ) : null}
                  <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                    Signed by {job.completionSignedBy ?? 'customer'} · {formatDate(job.completionSignedAt)}
                  </Text>
                </View>
              </>
            ) : null}

            <View style={styles.notesHeader}>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 0, marginBottom: 0 }]}>NOTES</Text>
              {showExec ? (
                <Pressable
                  testID="add-note-button"
                  onPress={() => setNoteOpen(true)}
                  style={({ pressed }) => [styles.addNoteBtn, { borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Feather name="plus" size={13} color={colors.primary} />
                  <Text style={[styles.addNoteText, { color: colors.primary }]}>Add note</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {notes.length === 0 ? (
                <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>No notes yet</Text>
              ) : (
                notes.map((n) => (
                  <View key={n.id} style={styles.noteRow}>
                    <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                      {n.authorName ?? 'Staff'} · {formatDate(n.createdAt)}
                    </Text>
                    <Text style={[styles.body, { color: colors.foreground }]}>{n.content}</Text>
                  </View>
                ))
              )}
            </View>

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

          {!isClosed ? (
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
              {job.assignmentStatus !== 'accepted' ? (
                <>
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
                  {primaryBtn('Accept Job', 'check', () => acceptMutation.mutate(), acceptMutation.isPending, 'accept-button')}
                </>
              ) : phase === 'idle' ? (
                <>
                  {primaryBtn('Start Travel', 'navigation', () => travelMutation.mutate(), travelMutation.isPending, 'start-travel-button', colors.accent)}
                  {primaryBtn('Arrive on Site', 'map-pin', () => arriveMutation.mutate(), arriveMutation.isPending, 'arrive-button')}
                </>
              ) : phase === 'en_route' ? (
                primaryBtn('Arrive on Site', 'map-pin', () => arriveMutation.mutate(), arriveMutation.isPending, 'arrive-button')
              ) : phase === 'on_site' ? (
                <>
                  {isPaused
                    ? primaryBtn('Resume', 'play', () => resumeMutation.mutate(), resumeMutation.isPending, 'resume-button', '#F59E0B')
                    : (
                      <Pressable
                        testID="pause-button"
                        onPress={() => setPauseOpen(true)}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.actionButton,
                          { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, opacity: pressed || busy ? 0.7 : 1 },
                        ]}
                      >
                        <Feather name="pause" size={18} color={colors.foreground} />
                        <Text style={[styles.actionText, { color: colors.foreground }]}>Pause</Text>
                      </Pressable>
                    )}
                  {primaryBtn(
                    'Complete Work',
                    'check-circle',
                    () => (job.completionSignedAt ? completeMutation.mutate() : setCompleteSheetOpen(true)),
                    completeMutation.isPending,
                    'complete-button',
                  )}
                </>
              ) : (
                <View style={[styles.doneBanner, { backgroundColor: '#22C55E18', borderColor: '#22C55E55' }]}>
                  <Feather name="check-circle" size={18} color="#22C55E" />
                  <Text style={[styles.actionText, { color: '#22C55E' }]}>
                    {job.serviceChannel === 'on_site' || job.serviceChannel === 'remote'
                      ? 'Work completed — job complete'
                      : 'Work completed — ready for pickup'}
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </>
      )}

      {/* Decline reasons */}
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

      {/* Pause reasons */}
      <Modal visible={pauseOpen} transparent animationType="fade" onRequestClose={() => setPauseOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPauseOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Why are you pausing?</Text>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>
              Paused time is not billed to the customer
            </Text>
            {PAUSE_REASONS.map((reason) => (
              <Pressable
                key={reason}
                testID={`pause-reason-${reason}`}
                disabled={pauseMutation.isPending}
                onPress={() => pauseMutation.mutate(reason)}
                style={({ pressed }) => [
                  styles.reasonRow,
                  { backgroundColor: pressed ? colors.secondary : 'transparent', borderColor: colors.border },
                ]}
              >
                <Text style={[styles.reasonText, { color: colors.foreground }]}>{reason}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
            {pauseMutation.isPending ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Complete: signature prompt sheet */}
      <Modal visible={completeSheetOpen} transparent animationType="fade" onRequestClose={() => setCompleteSheetOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompleteSheetOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Get a customer sign-off?</Text>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground, marginBottom: 12 }]}>
              A signature confirms the customer approved the completed work.
            </Text>
            <Pressable
              testID="capture-signoff-button"
              onPress={() => { setCompleteSheetOpen(false); setSignOpen(true); }}
              style={({ pressed }) => [styles.actionButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
            >
              <Feather name="edit-3" size={18} color={colors.primaryForeground} />
              <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Capture Sign-off</Text>
            </Pressable>
            <Pressable
              testID="complete-without-signature-button"
              onPress={() => { setCompleteSheetOpen(false); completeMutation.mutate(); }}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, marginTop: 10, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.actionText, { color: colors.mutedForeground }]}>Complete Without Signature</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Signature capture */}
      <Modal visible={signOpen} transparent animationType="fade" onRequestClose={() => setSignOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSignOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '88%' }]}
            onPress={() => undefined}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Customer sign-off</Text>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground, marginBottom: 10 }]}>
              Please review the work summary below before signing.
            </Text>

            {/* What the customer is signing */}
            <View style={[styles.signSummary, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>WORK ORDER</Text>
              <Text style={[styles.signSummaryValue, { color: colors.foreground }]}>{job?.workOrderNumber ?? ''}</Text>

              <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>ITEM</Text>
              <Text style={[styles.signSummaryValue, { color: colors.foreground }]}>{job?.itemDescription ?? ''}</Text>

              <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>WORK REQUESTED</Text>
              <Text style={[styles.signSummaryValue, { color: colors.foreground }]}>{job?.problemDescription ?? ''}</Text>

              {job?.diagnosis ? (
                <>
                  <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>DIAGNOSIS / WORK DONE</Text>
                  <Text style={[styles.signSummaryValue, { color: colors.foreground }]}>{job.diagnosis}</Text>
                </>
              ) : null}

              {Array.isArray(job?.items) && job.items.length > 0 ? (
                <>
                  <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>PARTS & LABOUR</Text>
                  {job.items.map((it, i) => (
                    <View key={i} style={styles.signItemRow}>
                      <Text style={[styles.signItemName, { color: colors.foreground }]} numberOfLines={2}>
                        {it.quantity > 1 ? `${it.quantity} × ` : ''}{it.description}
                      </Text>
                      <Text style={[styles.signItemPrice, { color: colors.foreground }]}>
                        ${(it.price * it.quantity).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}

              {job && job.total > 0 ? (
                <View style={[styles.signItemRow, { marginTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 6 }]}>
                  <Text style={[styles.signItemName, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>Total</Text>
                  <Text style={[styles.signItemPrice, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                    ${job.total.toFixed(2)}
                  </Text>
                </View>
              ) : null}

              {liveMinutes > 0 ? (
                <>
                  <Text style={[styles.signSummaryLabel, { color: colors.mutedForeground }]}>TIME ON SITE</Text>
                  <Text style={[styles.signSummaryValue, { color: colors.foreground }]}>{fmtDuration(liveMinutes)}</Text>
                </>
              ) : null}
            </View>

            <Text style={[styles.signAttestation, { color: colors.mutedForeground }]}>
              By signing below, I confirm that the work described above has been completed to my
              satisfaction. A copy of the signed work order will be emailed to me.
            </Text>

            <TextInput
              testID="signer-name-input"
              style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground, minHeight: 44 }]}
              placeholder="Customer name"
              placeholderTextColor={colors.mutedForeground}
              value={signName}
              onChangeText={setSignName}
            />
            <View style={{ height: 12 }} />
            <SignaturePad
              height={180}
              onStrokesChange={(strokes, size) => { signRef.current = { strokes, size }; }}
            />
            <Pressable
              testID="save-signature-button"
              disabled={signatureMutation.isPending}
              onPress={() => {
                const { strokes, size } = signRef.current;
                if (!signName.trim() || strokes.length === 0 || size.width === 0) return;
                signatureMutation.mutate({
                  image: strokesToSvgDataUrl(strokes, Math.round(size.width), Math.round(size.height)),
                  signedBy: signName.trim(),
                });
              }}
              style={({ pressed }) => [
                styles.actionButton,
                { backgroundColor: colors.primary, opacity: pressed || signatureMutation.isPending ? 0.6 : 1, marginTop: 14 },
              ]}
            >
              {signatureMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <>
                  <Feather name="check-circle" size={18} color={colors.primaryForeground} />
                  <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Save & Complete Work</Text>
                </>
              )}
            </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Note composer */}
      <Modal visible={noteOpen} transparent animationType="fade" onRequestClose={() => setNoteOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNoteOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => undefined}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add a job note</Text>
            <TextInput
              testID="note-input"
              style={[styles.noteInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="What happened on the job?"
              placeholderTextColor={colors.mutedForeground}
              multiline
              value={noteText}
              onChangeText={setNoteText}
              autoFocus
            />
            <Pressable
              testID="save-note-button"
              disabled={noteMutation.isPending || !noteText.trim()}
              onPress={() => noteMutation.mutate(noteText.trim())}
              style={({ pressed }) => [
                styles.actionButton,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed || noteMutation.isPending || !noteText.trim() ? 0.6 : 1,
                  marginTop: 12,
                },
              ]}
            >
              {noteMutation.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Save Note</Text>
              )}
            </Pressable>
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
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },
  addNoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addNoteText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timerValue: { fontSize: 30, fontFamily: 'Inter_700Bold', fontVariant: ['tabular-nums'] },
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
  doneBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 18 },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginBottom: 12 },
  signSummary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  signSummaryLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 10,
  },
  signSummaryValue: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginTop: 2,
  },
  signItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  signItemName: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  signItemPrice: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  signAttestation: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    marginBottom: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 90,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlignVertical: 'top',
  },
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
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { width: 92, height: 92 },
  photo: { width: 92, height: 92, borderRadius: 10 },
  photoDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureImage: { width: '100%', height: 120, borderRadius: 10, backgroundColor: '#FFFFFF' },
});
