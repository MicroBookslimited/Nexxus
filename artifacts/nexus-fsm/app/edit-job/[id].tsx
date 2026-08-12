/**
 * Admin / manager / supervisor: edit a work order from the phone.
 *
 * Uses the same office PATCH endpoint the web POS uses. The server emails any
 * newly-assigned technicians and a newly-linked customer automatically.
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
import {
  canEditWorkOrders,
  createCustomer,
  getJob,
  listStaff,
  searchCustomers,
  updateWorkOrder,
  type CustomerLite,
} from '@/lib/fsm-api';

const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const CHANNELS = [
  { id: 'on_site', label: 'On site' },
  { id: 'in_store', label: 'In store' },
  { id: 'remote', label: 'Remote' },
] as const;

export default function EditJobScreen() {
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

  // Form state, seeded from the loaded job once.
  const [loaded, setLoaded] = useState(false);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [customerCleared, setCustomerCleared] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', phone2: '', email: '', address: '', directions: '' });
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [channel, setChannel] = useState<string>('on_site');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [error, setError] = useState<string | null>(null);

  const job = jobQuery.data;

  React.useEffect(() => {
    if (!job || loaded) return;
    setContactName(job.contactName ?? '');
    setContactPhone(job.contactPhone ?? '');
    setItemDescription(job.itemDescription ?? '');
    setProblemDescription(job.problemDescription ?? '');
    setPriority(job.priority ?? 'normal');
    setChannel(job.serviceChannel ?? 'on_site');
    setAssigneeIds(job.assignedStaffIds ?? []);
    setAppointmentDate(job.appointmentDate ? String(job.appointmentDate).slice(0, 10) : '');
    setEstimatedHours(job.estimatedMinutes != null ? String(Math.round((job.estimatedMinutes / 60) * 10) / 10) : '');
    if (job.customerId != null && job.customerName) {
      setCustomer({ id: job.customerId, name: job.customerName, phone: job.contactPhone });
    }
    setLoaded(true);
  }, [job, loaded]);

  // Debounced customer search.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);
  const customersQuery = useQuery({
    queryKey: ['fsm-customer-search', debouncedSearch],
    queryFn: () => searchCustomers(debouncedSearch),
    enabled: !customer && debouncedSearch.trim().length >= 2,
  });

  const selectCustomer = (c: CustomerLite) => {
    setCustomer(c);
    setCustomerCleared(false);
    setCustomerSearch('');
    setShowNewCustomer(false);
    setContactName(c.name);
    setContactPhone(c.phone ?? c.phone2 ?? '');
  };

  const newCustomerMutation = useMutation({
    mutationFn: () =>
      createCustomer({
        name: newCust.name.trim(),
        phone: newCust.phone.trim() || undefined,
        phone2: newCust.phone2.trim() || undefined,
        email: newCust.email.trim() || undefined,
        address: newCust.address.trim() || undefined,
        directions: newCust.directions.trim() || undefined,
      }),
    onSuccess: (c) => {
      selectCustomer(c);
      setNewCust({ name: '', phone: '', phone2: '', email: '', address: '', directions: '' });
    },
    onError: (e) => setError((e as Error).message),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const hours = estimatedHours.trim() ? parseFloat(estimatedHours) : null;
      const apptTrim = appointmentDate.trim();
      return updateWorkOrder(staff!.id, jobId, {
        // Only send customerId when it changed, so an untouched edit doesn't
        // re-trigger the customer notification.
        ...(customer && customer.id !== job?.customerId ? { customerId: customer.id, contactEmail: customer.email ?? null } : {}),
        ...(customerCleared && job?.customerId != null ? { customerId: null } : {}),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        itemDescription: itemDescription.trim(),
        problemDescription: problemDescription.trim(),
        serviceChannel: channel,
        priority,
        assignedStaffIds: assigneeIds,
        appointmentDate: apptTrim ? apptTrim : null,
        estimatedMinutes: hours != null && !isNaN(hours) && hours > 0 ? Math.round(hours * 60) : null,
      });
    },
    onSuccess: () => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      void qc.invalidateQueries({ queryKey: ['fsm-job', staff?.id, jobId] });
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

  if (job.completionSignature || job.customerSignature || job.status === 'collected' || job.status === 'cancelled') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Feather name="lock" size={28} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 10, textAlign: 'center' }}>
          This work order is {job.completionSignature || job.customerSignature ? 'signed off' : 'closed'} and can no longer be edited.
        </Text>
      </View>
    );
  }

  const canSubmit = itemDescription.trim().length > 0 && problemDescription.trim().length > 0;
  const apptValid = !appointmentDate.trim() || /^\d{4}-\d{2}-\d{2}$/.test(appointmentDate.trim());

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Edit {job.workOrderNumber}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Customer</Text>
        {customer ? (
          <View style={[styles.customerCard, { borderColor: colors.primary, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '700' }}>{customer.name}</Text>
              {!!(customer.phone || customer.phone2) && (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {[customer.phone, customer.phone2].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            <Pressable hitSlop={10} onPress={() => { setCustomer(null); setCustomerCleared(true); }}>
              <Feather name="x-circle" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : (
          <View style={{ marginBottom: 4 }}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search saved customers…"
              placeholderTextColor={colors.mutedForeground}
            />
            {customersQuery.isFetching && <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 8 }} />}
            {(customersQuery.data ?? []).slice(0, 6).map((c) => (
              <Pressable key={c.id} onPress={() => selectCustomer(c)} style={[styles.customerRow, { borderColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{c.name}</Text>
                {!!(c.phone || c.company) && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                    {[c.phone, c.company].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </Pressable>
            ))}
            <Pressable onPress={() => setShowNewCustomer((v) => !v)} style={{ marginTop: 8, marginBottom: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                {showNewCustomer ? '− Cancel new customer' : '+ New customer'}
              </Text>
            </Pressable>
            {showNewCustomer && (
              <View style={[styles.newCustomerBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Field label="Name *" value={newCust.name} onChange={(t) => setNewCust((f) => ({ ...f, name: t }))} colors={colors} placeholder="Customer or business name" />
                <Field label="Phone" value={newCust.phone} onChange={(t) => setNewCust((f) => ({ ...f, phone: t }))} colors={colors} placeholder="876-555-0000" keyboardType="phone-pad" />
                <Field label="Email" value={newCust.email} onChange={(t) => setNewCust((f) => ({ ...f, email: t }))} colors={colors} placeholder="customer@example.com" />
                <Field label="Address" value={newCust.address} onChange={(t) => setNewCust((f) => ({ ...f, address: t }))} colors={colors} placeholder="Street / district" />
                <Pressable
                  disabled={!newCust.name.trim() || newCustomerMutation.isPending}
                  onPress={() => { setError(null); newCustomerMutation.mutate(); }}
                  style={[styles.saveCustomerBtn, { backgroundColor: newCust.name.trim() ? colors.primary : colors.border }]}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                    {newCustomerMutation.isPending ? 'Saving…' : 'Save & link customer'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <Field label="Contact name" value={contactName} onChange={setContactName} colors={colors} placeholder="Who to speak to on site" />
        <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} colors={colors} placeholder="876-555-0000" keyboardType="phone-pad" />
        <Field label="Item / site *" value={itemDescription} onChange={setItemDescription} colors={colors} placeholder="e.g. CCTV installation — Luidas Vale office" />
        <Field label="Job description *" value={problemDescription} onChange={setProblemDescription} colors={colors} placeholder="What needs to be done?" multiline />
        <Field label="Appointment date (YYYY-MM-DD)" value={appointmentDate} onChange={setAppointmentDate} colors={colors} placeholder="e.g. 2026-08-15" />
        {!apptValid && <Text style={{ color: '#dc2626', fontSize: 12, marginTop: -8, marginBottom: 10 }}>Use the format YYYY-MM-DD, or leave blank.</Text>}
        <Field label="Expected completion time (hours)" value={estimatedHours} onChange={setEstimatedHours} colors={colors} placeholder="e.g. 4" />

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

        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Assigned technicians</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 6 }}>
          Newly-added technicians are emailed right away. Changing the team resets acceptance.
        </Text>
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
          disabled={!canSubmit || !apptValid || saveMutation.isPending}
          onPress={() => { setError(null); saveMutation.mutate(); }}
          style={[styles.submitBtn, { backgroundColor: canSubmit && apptValid ? colors.primary : colors.border }]}
        >
          <Text style={styles.submitText}>
            {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
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
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 14 },
  customerRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  newCustomerBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  saveCustomerBtn: { paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  submitBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
