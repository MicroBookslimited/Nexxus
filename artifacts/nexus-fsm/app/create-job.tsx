/**
 * Admin: create a work order from the phone.
 *
 * Uses the same office endpoint the web POS uses (tenant token), so
 * numbering, notifications, and status history behave identically.
 * Kept deliberately lean for field use — customer contact, the item,
 * the problem, priority, and an optional technician assignment.
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { createWorkOrder, isAdminRole, listStaff } from '@/lib/fsm-api';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const CHANNELS = [
  { id: 'on_site', label: 'On site' },
  { id: 'in_store', label: 'In store' },
  { id: 'remote', label: 'Remote' },
] as const;

export default function CreateJobScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const qc = useQueryClient();

  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [channel, setChannel] = useState<string>('on_site');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const staffQuery = useQuery({ queryKey: ['fsm-staff-list'], queryFn: listStaff });

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkOrder(staff!.id, {
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        itemDescription: itemDescription.trim(),
        problemDescription: problemDescription.trim(),
        serviceType: 'Installation',
        serviceChannel: channel,
        priority,
        assignedStaffIds: assigneeIds.length ? assigneeIds : undefined,
      }),
    onSuccess: (wo) => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      router.replace(`/job/${wo.id}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  if (!isAdminRole(staff?.role)) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Admin access required.</Text>
      </View>
    );
  }

  const canSubmit = itemDescription.trim().length > 0 && problemDescription.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>New Work Order</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Field label="Customer / contact name" value={contactName} onChange={setContactName} colors={colors} placeholder="e.g. Petcom Ltd — J. Brown" />
        <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} colors={colors} placeholder="876-555-0000" keyboardType="phone-pad" />
        <Field label="Item / site *" value={itemDescription} onChange={setItemDescription} colors={colors} placeholder="e.g. CCTV installation — Luidas Vale office" />
        <Field label="Job description *" value={problemDescription} onChange={setProblemDescription} colors={colors} placeholder="What needs to be done?" multiline />

        <Text style={[styles.label, { color: colors.mutedForeground }]}>Priority</Text>
        <View style={styles.chipRow}>
          {PRIORITIES.map((p) => (
            <Chip key={p} label={p} on={priority === p} onPress={() => setPriority(p)} colors={colors} />
          ))}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Service channel</Text>
        <View style={styles.chipRow}>
          {CHANNELS.map((c) => (
            <Chip key={c.id} label={c.label} on={channel === c.id} onPress={() => setChannel(c.id)} colors={colors} />
          ))}
        </View>

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Assign technicians</Text>
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
          disabled={!canSubmit || createMutation.isPending}
          onPress={() => { setError(null); createMutation.mutate(); }}
          style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
        >
          <Text style={styles.submitText}>
            {createMutation.isPending ? 'Creating…' : 'Create Work Order'}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({ label, value, onChange, colors, placeholder, multiline, keyboardType }: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  colors: ReturnType<typeof useColors>;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'phone-pad';
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
        keyboardType={keyboardType}
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
  submitBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
