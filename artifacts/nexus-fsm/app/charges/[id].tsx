/**
 * Charges & Fees — the money side of a job, from the field.
 *
 * Shows every billable line the customer will be asked to pay (parts, labour
 * and fees) with the running total, and lets office roles add a call-out fee,
 * extra labour or any other charge without going back to a desktop. The server
 * recomputes the totals and freezes the whole lot once the customer signs.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  getJob,
  isAdminRole,
  updateWorkOrderItems,
  type FsmWorkItem,
} from '@/lib/fsm-api';

const money = (n: number) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;

type ChargeKind = 'fee' | 'labor';

/** Strict decimal parse — a blank or half-typed box must not become 0. */
function parseNumber(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Canonical form of one line, used to detect that the job changed underneath us. */
const fingerprint = (items: FsmWorkItem[]): string =>
  JSON.stringify(items.map((it) => [
    it.type ?? 'part', it.description, it.price, it.quantity,
    it.productId ?? null, it.isTaxable ?? null, it.costPrice ?? null,
  ]));

function notify(kind: 'success' | 'error') {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  }
}

function lineLabel(type: string | undefined): string {
  if (type === 'fee') return 'FEE';
  if (type === 'labor') return 'LABOUR';
  return 'PART';
}

export default function ChargesScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(idParam), 10);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { staff } = useStaff();
  const qc = useQueryClient();
  const admin = isAdminRole(staff?.role);

  const { data: job, isLoading } = useQuery({
    queryKey: ['fsm-job', staff?.id, id],
    queryFn: () => getJob(staff!.id, id),
    enabled: !!staff && Number.isInteger(id),
  });

  const [kind, setKind] = useState<ChargeKind>('fee');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [qty, setQty] = useState('1');

  const items = useMemo<FsmWorkItem[]>(() => job?.items ?? [], [job?.items]);

  const closed = job ? job.status === 'collected' || job.status === 'cancelled' : false;
  const signedOff = job ? !!(job.completionSignature || job.customerSignature) : false;
  const locked = closed || signedOff;
  const canEdit = admin && !locked;

  const reset = () => { setDescription(''); setAmount(''); setQty('1'); };

  /**
   * The work order carries its lines as one array, so a charge is saved by
   * sending the whole list back — which means a stale copy would silently erase
   * someone else's line. Re-read the job and refuse the write unless it still
   * matches exactly what this screen was showing. That also keeps removal
   * honest: positions are only meaningful against an unchanged list, so two
   * identical lines can't be confused for one another.
   */
  const saveMutation = useMutation({
    mutationFn: async (change: { baseline: FsmWorkItem[]; add?: FsmWorkItem; removeIndex?: number }) => {
      const fresh = await getJob(staff!.id, id);
      const freshItems = fresh.items ?? [];
      if (fingerprint(freshItems) !== fingerprint(change.baseline)) {
        throw new Error('Someone else just changed the charges on this job. The list has been refreshed — check it and try again.');
      }
      let next = [...freshItems];
      if (change.removeIndex != null) next.splice(change.removeIndex, 1);
      if (change.add) next = [...next, change.add];
      return updateWorkOrderItems(staff!.id, id, next);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fsm-job', staff?.id, id] });
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      reset();
      notify('success');
    },
    onError: (e) => {
      notify('error');
      void qc.invalidateQueries({ queryKey: ['fsm-job', staff?.id, id] });
      Alert.alert('Charges', e instanceof Error ? e.message : 'Could not save the charge');
    },
  });

  const price = parseNumber(amount);
  const quantity = parseNumber(qty);
  const canSubmit = description.trim().length > 0
    && price != null && price > 0
    && quantity != null && quantity > 0
    && !saveMutation.isPending;

  const linesTotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

  if (isLoading || !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Charges & Fees</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{job.workOrderNumber}</Text>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        bottomOffset={24}
      >
        {locked ? (
          <View style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="lock" size={14} color={colors.mutedForeground} />
            <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
              {closed ? 'This job is closed — charges can no longer be changed.'
                : 'The customer has signed off — charges are locked.'}
            </Text>
          </View>
        ) : !admin ? (
          <View style={[styles.banner, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Feather name="info" size={14} color={colors.mutedForeground} />
            <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
              Ask the office to add a charge — only admins and managers can price a job.
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BILLABLE LINES</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {items.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Nothing charged to this job yet.
            </Text>
          ) : (
            items.map((it, i) => (
              <View key={`${it.description}-${i}`} style={[styles.lineRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.lineDesc, { color: colors.foreground }]} numberOfLines={2}>{it.description}</Text>
                  <Text style={[styles.lineSub, { color: colors.mutedForeground }]}>
                    {lineLabel(it.type)} · {it.quantity} × {money(it.price)}
                  </Text>
                </View>
                <Text style={[styles.lineAmount, { color: colors.foreground }]}>{money(it.price * it.quantity)}</Text>
                {canEdit ? (
                  <Pressable
                    hitSlop={10}
                    disabled={saveMutation.isPending}
                    onPress={() => Alert.alert(
                      'Remove charge',
                      `Remove “${it.description}” from this job?`,
                      [
                        { text: 'Keep it', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => saveMutation.mutate({ baseline: items, removeIndex: i }) },
                      ],
                    )}
                    style={{ marginLeft: 10 }}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructive ?? '#dc2626'} />
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
          <TotalRow label="Subtotal" value={money(job.subtotal ?? linesTotal)} colors={colors} />
          {(job.discountAmount ?? 0) > 0 ? (
            <TotalRow label="Discount" value={`− ${money(job.discountAmount ?? 0)}`} colors={colors} />
          ) : null}
          {(job.tax ?? 0) > 0 ? <TotalRow label="Tax" value={money(job.tax ?? 0)} colors={colors} /> : null}
          <TotalRow label="Job total" value={money(job.total)} colors={colors} strong />
          {(job.depositPaid ?? 0) > 0 ? (
            <TotalRow label="Paid so far" value={money(job.depositPaid ?? 0)} colors={colors} />
          ) : null}
        </View>

        {canEdit ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>ADD A CHARGE</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <KindToggle label="Fee" on={kind === 'fee'} onPress={() => setKind('fee')} colors={colors} />
                <KindToggle label="Labour" on={kind === 'labor'} onPress={() => setKind('labor')} colors={colors} />
              </View>

              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>What is it for?</Text>
              <TextInput
                testID="charge-description-input"
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                value={description}
                onChangeText={setDescription}
                placeholder={kind === 'fee' ? 'e.g. Call-out fee' : 'e.g. Extra labour — 2nd technician'}
                placeholderTextColor={colors.mutedForeground}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount each</Text>
                  <TextInput
                    testID="charge-amount-input"
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.mutedForeground}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>Qty</Text>
                  <TextInput
                    testID="charge-qty-input"
                    style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                    value={qty}
                    onChangeText={setQty}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Adds {money((price ?? 0) * (quantity ?? 0))} to the job total.
              </Text>

              <Pressable
                testID="charge-submit-button"
                disabled={!canSubmit}
                onPress={() => {
                  if (price == null || quantity == null) return;
                  saveMutation.mutate({
                    baseline: items,
                    add: {
                      type: kind,
                      description: description.trim(),
                      price: Math.round(price * 100) / 100,
                      quantity,
                      isTaxable: true,
                    },
                  });
                }}
                style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
              >
                {saveMutation.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>Add charge</Text>}
              </Pressable>
            </View>
          </>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function TotalRow({ label, value, colors, strong }: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  strong?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.lineSub, { color: strong ? colors.foreground : colors.mutedForeground, fontSize: strong ? 14 : 13 }]}>
        {label}
      </Text>
      <Text style={[styles.lineAmount, { color: colors.foreground, fontWeight: strong ? '700' : '600' }]}>{value}</Text>
    </View>
  );
}

function KindToggle({ label, on, onPress, colors }: {
  label: string; on: boolean; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, {
        backgroundColor: on ? colors.primary : 'transparent',
        borderColor: on ? colors.primary : colors.border,
      }]}
    >
      <Text style={{ color: on ? '#fff' : colors.foreground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 14 },
  bannerText: { fontSize: 12, flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  emptyText: { fontSize: 13, paddingVertical: 16, textAlign: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  lineDesc: { fontSize: 14, fontWeight: '600' },
  lineSub: { fontSize: 12, marginTop: 2 },
  lineAmount: { fontSize: 14, fontWeight: '600' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  hint: { fontSize: 12, marginTop: 10 },
  toggle: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  submitBtn: { marginTop: 12, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
