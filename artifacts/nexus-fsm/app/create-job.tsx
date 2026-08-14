/**
 * Admin: create a work order from the phone.
 *
 * Uses the same office endpoint the web POS uses (tenant token), so
 * numbering, notifications, and status history behave identically.
 * Includes an optional first appointment slot so the booking is calendar-ready
 * straight away, with clash warnings when a technician is already scheduled
 * for the chosen window.
 */
import React, { useState, useMemo } from 'react';
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
import DatePicker from '@/components/DatePicker';
import {
  createCustomer,
  createWorkOrder,
  createWorkOrderAppointment,
  getCalendarAppointments,
  isAdminRole,
  listStaff,
  searchCustomers,
  type CustomerLite,
} from '@/lib/fsm-api';
import {
  APPOINTMENT_SLOTS,
  DEFAULT_APPOINTMENT_SLOT_ID,
  emailError,
  phoneError,
  slotToRange,
} from '@workspace/api-client-react';

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

  // Customer link: selected saved customer, or free-text walk-in contact.
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', phone: '', phone2: '', email: '', address: '', directions: '' });
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPhoneTouched, setContactPhoneTouched] = useState(false);
  const [itemDescription, setItemDescription] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [channel, setChannel] = useState<string>('on_site');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  // Optional first appointment
  const [showAppt, setShowAppt] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [slotId, setSlotId] = useState(DEFAULT_APPOINTMENT_SLOT_ID);

  // New-customer form validation
  const [newPhoneTouched, setNewPhoneTouched] = useState(false);
  const [newEmailTouched, setNewEmailTouched] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const staffQuery = useQuery({ queryKey: ['fsm-staff-list'], queryFn: listStaff });

  // Debounce the customer search a touch so we don't hammer the API per keystroke.
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

  // Conflict check: when we have a date + slot + assignees, fetch calendar for
  // that window and warn about clashes. Never blocks submission.
  const apptRange = useMemo(() => {
    if (!showAppt || !apptDate) return null;
    return slotToRange(apptDate, slotId);
  }, [showAppt, apptDate, slotId]);

  const conflictQuery = useQuery({
    queryKey: ['fsm-appt-conflicts', apptRange?.start.toISOString(), apptRange?.end.toISOString(), assigneeIds],
    queryFn: () => {
      if (!apptRange || !staff) return [];
      return getCalendarAppointments(
        staff.id,
        apptRange.start.toISOString(),
        apptRange.end.toISOString(),
      );
    },
    enabled: !!apptRange && !!staff && assigneeIds.length > 0,
    staleTime: 30_000,
  });

  /** Staff who already have an appointment in this slot. */
  const clashingIds = useMemo(() => {
    if (!conflictQuery.data || assigneeIds.length === 0) return new Set<number>();
    return new Set(
      conflictQuery.data.flatMap((a) => {
        const ids: number[] = Array.isArray(a.staffIds) ? (a.staffIds as number[]) : a.staffId ? [a.staffId as number] : [];
        return ids.filter((id) => assigneeIds.includes(id));
      }),
    );
  }, [conflictQuery.data, assigneeIds]);

  const selectCustomer = (c: CustomerLite) => {
    setCustomer(c);
    setCustomerSearch('');
    setShowNewCustomer(false);
    setContactName(c.name);
    setContactPhone(c.phone ?? c.phone2 ?? '');
  };

  const newCustomerMutation = useMutation({
    mutationFn: () => {
      const pErr = phoneError(newCust.phone);
      const eErr = emailError(newCust.email);
      if (pErr && newCust.phone.trim()) throw new Error(pErr);
      if (eErr && newCust.email.trim()) throw new Error(eErr);
      return createCustomer({
        name: newCust.name.trim(),
        phone: newCust.phone.trim() || undefined,
        phone2: newCust.phone2.trim() || undefined,
        email: newCust.email.trim() || undefined,
        address: newCust.address.trim() || undefined,
        directions: newCust.directions.trim() || undefined,
      });
    },
    onSuccess: (c) => {
      selectCustomer(c);
      setNewCust({ name: '', phone: '', phone2: '', email: '', address: '', directions: '' });
      setNewPhoneTouched(false);
      setNewEmailTouched(false);
    },
    onError: (e) => setError((e as Error).message),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const pErr = contactPhoneTouched ? phoneError(contactPhone) : null;
      if (pErr) throw new Error(pErr);

      const wo = await createWorkOrder(staff!.id, {
        customerId: customer?.id,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: customer?.email ?? undefined,
        itemDescription: itemDescription.trim(),
        problemDescription: problemDescription.trim(),
        serviceType: 'Installation',
        serviceChannel: channel,
        priority,
        assignedStaffIds: assigneeIds.length ? assigneeIds : undefined,
      });

      if (showAppt && apptRange) {
        await createWorkOrderAppointment(staff!.id, wo.id, {
          startTime: apptRange.start.toISOString(),
          endTime: apptRange.end.toISOString(),
          staffId: assigneeIds[0],
        });
      }

      return wo;
    },
    onSuccess: (wo) => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      void qc.invalidateQueries({ queryKey: ['fsm-calendar'] });
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

  const contactPhoneErr = contactPhoneTouched ? phoneError(contactPhone) : null;
  const canSubmit = itemDescription.trim().length > 0 && problemDescription.trim().length > 0 && !contactPhoneErr;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 4 }}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>New Work Order</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {/* ── Customer ────────────────────────────────────────────────── */}
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
              {!!customer.address && (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                  {customer.address}{customer.city ? `, ${customer.city}` : ''}
                </Text>
              )}
              {!!customer.directions && (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>📍 {customer.directions}</Text>
              )}
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => {
                if (customer && contactName.trim() === customer.name) setContactName('');
                if (customer && contactPhone.trim() === (customer.phone ?? customer.phone2 ?? '')) setContactPhone('');
                setCustomer(null);
              }}
            >
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
            {customersQuery.data && customersQuery.data.length === 0 && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 8 }}>No matches — add them below.</Text>
            )}
            <Pressable onPress={() => setShowNewCustomer((v) => !v)} style={{ marginTop: 8, marginBottom: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                {showNewCustomer ? '− Cancel new customer' : '+ New customer'}
              </Text>
            </Pressable>
            {showNewCustomer && (
              <View style={[styles.newCustomerBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Field label="Name *" value={newCust.name} onChange={(t) => setNewCust((f) => ({ ...f, name: t }))} colors={colors} placeholder="Customer or business name" />
                <FieldWithError
                  label="Phone"
                  value={newCust.phone}
                  onChange={(t) => setNewCust((f) => ({ ...f, phone: t }))}
                  onBlur={() => setNewPhoneTouched(true)}
                  error={newPhoneTouched ? phoneError(newCust.phone) : null}
                  colors={colors}
                  placeholder="876-555-0000"
                  keyboardType="phone-pad"
                />
                <Field label="Alternate phone" value={newCust.phone2} onChange={(t) => setNewCust((f) => ({ ...f, phone2: t }))} colors={colors} placeholder="Second contact (optional)" keyboardType="phone-pad" />
                <FieldWithError
                  label="Email"
                  value={newCust.email}
                  onChange={(t) => setNewCust((f) => ({ ...f, email: t }))}
                  onBlur={() => setNewEmailTouched(true)}
                  error={newEmailTouched ? emailError(newCust.email) : null}
                  colors={colors}
                  placeholder="customer@example.com"
                  keyboardType="email-address"
                />
                <Field label="Address" value={newCust.address} onChange={(t) => setNewCust((f) => ({ ...f, address: t }))} colors={colors} placeholder="Street / district" />
                <Field label="Directions / landmark" value={newCust.directions} onChange={(t) => setNewCust((f) => ({ ...f, directions: t }))} colors={colors} placeholder="e.g. Blue gate opposite the gas station" />
                <Pressable
                  disabled={!newCust.name.trim() || newCustomerMutation.isPending}
                  onPress={() => { setNewPhoneTouched(true); setNewEmailTouched(true); setError(null); newCustomerMutation.mutate(); }}
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

        {/* ── Contact ─────────────────────────────────────────────────── */}
        <Field label="Contact name" value={contactName} onChange={setContactName} colors={colors} placeholder="Who to speak to on site" />
        <FieldWithError
          label="Contact phone"
          value={contactPhone}
          onChange={setContactPhone}
          onBlur={() => setContactPhoneTouched(true)}
          error={contactPhoneErr}
          colors={colors}
          placeholder="876-555-0000"
          keyboardType="phone-pad"
        />

        {/* ── Job details ─────────────────────────────────────────────── */}
        <Field label="Item / site *" value={itemDescription} onChange={setItemDescription} colors={colors} placeholder="e.g. CCTV installation — Luidas Vale office" />
        <Field label="Job description *" value={problemDescription} onChange={setProblemDescription} colors={colors} placeholder="What needs to be done?" multiline />

        {/* ── Priority & Channel ──────────────────────────────────────── */}
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

        {/* ── Technician assignment ───────────────────────────────────── */}
        <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 14 }]}>Assign technicians</Text>
        {staffQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <View style={styles.chipRow}>
            {(staffQuery.data ?? []).map((s) => {
              const clashing = clashingIds.has(s.id);
              return (
                <View key={s.id}>
                  <Chip
                    label={s.name}
                    on={assigneeIds.includes(s.id)}
                    onPress={() =>
                      setAssigneeIds((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                    colors={colors}
                    warnColor={clashing ? '#F59E0B' : undefined}
                  />
                  {clashing && assigneeIds.includes(s.id) && (
                    <Text style={styles.clashText}>Already booked this slot</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── First appointment ───────────────────────────────────────── */}
        <View style={[styles.apptToggleRow, { marginTop: 18 }]}>
          <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 0, flex: 1 }]}>
            Book first appointment
          </Text>
          <Pressable
            onPress={() => setShowAppt((v) => !v)}
            style={[styles.toggle, { backgroundColor: showAppt ? colors.primary : colors.border }]}
          >
            <View style={[styles.toggleThumb, { transform: [{ translateX: showAppt ? 18 : 2 }] }]} />
          </Pressable>
        </View>

        {showAppt && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
            <DatePicker value={apptDate} onChange={setApptDate} />
            <View style={{ height: 14 }} />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Arrival window</Text>
            <View style={styles.chipRow}>
              {APPOINTMENT_SLOTS.map((s) => (
                <Chip key={s.id} label={s.label} on={slotId === s.id} onPress={() => setSlotId(s.id)} colors={colors} />
              ))}
            </View>
            <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 6 }}>
              Customers are given a 2-hour arrival window, not an exact time.
            </Text>

            {clashingIds.size > 0 && (
              <View style={[styles.clashBanner, { backgroundColor: '#F59E0B18', borderColor: '#F59E0B' }]}>
                <Feather name="alert-triangle" size={14} color="#F59E0B" />
                <Text style={{ color: '#F59E0B', fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1 }}>
                  {clashingIds.size === 1 ? 'One technician is' : `${clashingIds.size} technicians are`} already booked during this slot. You can still proceed.
                </Text>
              </View>
            )}
          </View>
        )}

        {error ? <Text style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>{error}</Text> : null}

        <Pressable
          disabled={!canSubmit || createMutation.isPending}
          onPress={() => { setContactPhoneTouched(true); setError(null); createMutation.mutate(); }}
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

// ─── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, value, onChange, colors, placeholder, multiline, keyboardType }: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  colors: ReturnType<typeof useColors>;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'phone-pad' | 'email-address';
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
        autoCapitalize={keyboardType === 'email-address' ? 'none' : undefined}
      />
    </View>
  );
}

function FieldWithError({ label, value, onChange, onBlur, error, colors, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  onBlur?: () => void;
  error: string | null;
  colors: ReturnType<typeof useColors>;
  placeholder?: string;
  keyboardType?: 'phone-pad' | 'email-address';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { color: colors.foreground, borderColor: error ? '#dc2626' : colors.border, backgroundColor: colors.card },
        ]}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : undefined}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function Chip({ label, on, onPress, colors, warnColor }: {
  label: string; on: boolean; onPress: () => void;
  colors: ReturnType<typeof useColors>; warnColor?: string;
}) {
  const bg = on ? (warnColor ?? colors.primary) : 'transparent';
  const border = on ? (warnColor ?? colors.primary) : (warnColor && !on ? warnColor : colors.border);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={{ color: on ? '#fff' : (warnColor ?? colors.foreground), fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>
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
  fieldError: { color: '#dc2626', fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 14 },
  customerRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  newCustomerBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  saveCustomerBtn: { paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  apptToggleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  clashText: { fontSize: 10, color: '#F59E0B', marginTop: 2, fontFamily: 'Inter_500Medium' },
  clashBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 10 },
  submitBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
