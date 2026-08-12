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
import {
  createCustomer,
  createWorkOrder,
  isAdminRole,
  listStaff,
  searchCustomers,
  type CustomerLite,
} from '@/lib/fsm-api';

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
  const [itemDescription, setItemDescription] = useState('');
  const [problemDescription, setProblemDescription] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [channel, setChannel] = useState<string>('on_site');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
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

  const selectCustomer = (c: CustomerLite) => {
    setCustomer(c);
    setCustomerSearch('');
    setShowNewCustomer(false);
    // Pre-fill the contact fields from the customer record (still editable).
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

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkOrder(staff!.id, {
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
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{customer.address}{customer.city ? `, ${customer.city}` : ''}</Text>
              )}
              {!!customer.directions && (
                <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>📍 {customer.directions}</Text>
              )}
            </View>
            <Pressable
              hitSlop={10}
              onPress={() => {
                // Clear the pre-filled contact fields too, so the old
                // customer's name/phone don't linger on the new work order.
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
                <Field label="Phone" value={newCust.phone} onChange={(t) => setNewCust((f) => ({ ...f, phone: t }))} colors={colors} placeholder="876-555-0000" keyboardType="phone-pad" />
                <Field label="Alternate phone" value={newCust.phone2} onChange={(t) => setNewCust((f) => ({ ...f, phone2: t }))} colors={colors} placeholder="Second contact (optional)" keyboardType="phone-pad" />
                <Field label="Email" value={newCust.email} onChange={(t) => setNewCust((f) => ({ ...f, email: t }))} colors={colors} placeholder="customer@example.com" />
                <Field label="Address" value={newCust.address} onChange={(t) => setNewCust((f) => ({ ...f, address: t }))} colors={colors} placeholder="Street / district" />
                <Field label="Directions / landmark" value={newCust.directions} onChange={(t) => setNewCust((f) => ({ ...f, directions: t }))} colors={colors} placeholder="e.g. Blue gate opposite the gas station" />
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
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, padding: 12, marginBottom: 14 },
  customerRow: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  newCustomerBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  saveCustomerBtn: { paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  submitBtn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
