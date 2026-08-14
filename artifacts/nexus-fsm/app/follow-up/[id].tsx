/**
 * Admin / manager / supervisor: schedule a follow-up visit on an open work
 * order. The server creates a follow-up appointment and emails the assigned
 * technician(s) and the customer right away.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { canEditWorkOrders, createFollowUpVisit, getJob, listStaff } from '@/lib/fsm-api';
import {
  APPOINTMENT_SLOTS,
  DEFAULT_APPOINTMENT_SLOT_ID,
  slotToRange,
} from '@workspace/api-client-react';
import DatePicker from '@/components/DatePicker';

export default function FollowUpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id: string }>();
  const jobId = parseInt(String(params.id), 10);

  const jobQuery = useQuery({
    queryKey: ['fsm-job', staff?.id, jobId],
    queryFn: () => getJob(staff!.id, jobId),
    enabled: !!staff && Number.isFinite(jobId),
  });
  const staffQuery = useQuery({ queryKey: ['fsm-staff-list'], queryFn: listStaff });
  const job = jobQuery.data;

  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState(DEFAULT_APPOINTMENT_SLOT_ID);
  const [notes, setNotes] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!job || loaded) return;
    setAssigneeIds(job.assignedStaffIds ?? []);
    setLoaded(true);
  }, [job, loaded]);

  // Require a real calendar date (rejects e.g. 2026-02-31, which JS would
  // silently roll over into March).
  const canSubmit = !!date;

  const submitMutation = useMutation({
    mutationFn: () => {
      const range = slotToRange(date, slotId);
      if (!range) throw new Error('Invalid date or arrival window');
      return createFollowUpVisit(staff!.id, jobId, {
        startTime: range.start.toISOString(),
        endTime: range.end.toISOString(),
        notes: notes.trim() || undefined,
        staffIds: assigneeIds.length ? assigneeIds : undefined,
      });
    },
    onSuccess: () => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      void qc.invalidateQueries({ queryKey: ['fsm-job', staff?.id, jobId] });
      void qc.invalidateQueries({ queryKey: ['fsm-calendar'] });
      router.back();
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!canEditWorkOrders(staff?.role)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Admin, manager or supervisor access required.</Text>
      </View>
    );
  }

  if (jobQuery.isLoading || !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (job.status === 'collected' || job.status === 'cancelled') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Feather name="lock" size={28} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 10, textAlign: 'center' }}>
          This work order is closed — follow-up visits can only be scheduled on open work orders.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Follow-up · {job.workOrderNumber}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.jobCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
            {job.itemDescription}
          </Text>
          {!!job.customerName && (
            <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{job.customerName}</Text>
          )}
        </View>

        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 14 }}>
          The assigned technicians and the customer are emailed as soon as you schedule the visit.
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Visit date *</Text>
        <DatePicker value={date} onChange={setDate} />
        <View style={{ height: 12 }} />
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Arrival window *</Text>
        <View style={styles.chipRow}>
          {APPOINTMENT_SLOTS.map((s) => (
            <Chip key={s.id} label={s.label} on={slotId === s.id} onPress={() => setSlotId(s.id)} colors={colors} />
          ))}
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 4, marginBottom: 14 }}>
          The customer is given a two-hour arrival window, not an exact time.
        </Text>

        <Field label="Notes for the visit" value={notes} onChange={setNotes} colors={colors} placeholder="What still needs to be done?" multiline />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Technicians for this visit</Text>
        {staffQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.chipRow}>
            {(staffQuery.data ?? []).map((s) => (
              <Chip
                key={s.id}
                label={s.name}
                on={assigneeIds.includes(s.id)}
                onPress={() =>
                  setAssigneeIds((prev) =>
                    prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                  )
                }
                colors={colors}
              />
            ))}
          </View>
        )}

        {error ? <Text style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>{error}</Text> : null}

        <Pressable
          disabled={!canSubmit || submitMutation.isPending}
          onPress={() => { setError(null); submitMutation.mutate(); }}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
        >
          <Text style={styles.submitText}>
            {submitMutation.isPending ? 'Scheduling…' : 'Schedule & Notify'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, colors, placeholder, multiline }: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  colors: ReturnType<typeof useColors>;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card },
          multiline && { minHeight: 80, textAlignVertical: 'top' },
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
      />
    </View>
  );
}

function Chip({ label, on, onPress, colors }: {
  label: string; on: boolean; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, {
        backgroundColor: on ? colors.primary : 'transparent',
        borderColor: on ? colors.primary : colors.border,
      }]}
    >
      <Text style={{ color: on ? '#fff' : colors.foreground, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  jobCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  fieldError: { color: '#dc2626', fontSize: 12, marginTop: -8, marginBottom: 10 },
  submitBtn: { marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
