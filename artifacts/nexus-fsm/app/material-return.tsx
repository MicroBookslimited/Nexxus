/**
 * Materials & tools return — the physical-goods twin of the cash handover.
 *
 * Two stages on one screen:
 *   1. DECLARE — the technician enters what they are bringing back to the
 *      office. Nothing moves in inventory yet.
 *   2. SIGN    — the technician passes the phone to a manager, supervisor or
 *      authorised person, who picks their name, enters their PIN and signs.
 *      Only that signature returns the items to stock, which is what protects
 *      the technician if a tool is later reported missing.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignaturePad, { strokesToSvgDataUrl } from '@/components/SignaturePad';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  cancelMaterialReturn,
  declareMaterialReturn,
  getJob,
  listMaterialHandovers,
  listReturnReceivers,
  signMaterialReturn,
  type Allocation,
} from '@/lib/fsm-api';

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function MaterialReturnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { staff } = useStaff();
  const params = useLocalSearchParams<{ jobId?: string; handoverId?: string }>();
  const jobId = params.jobId ? parseInt(String(params.jobId), 10) : NaN;
  const targetHandoverId = params.handoverId ? parseInt(String(params.handoverId), 10) : NaN;

  const [qty, setQty] = useState<Record<number, string>>({});
  const [declareNotes, setDeclareNotes] = useState('');
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [signNotes, setSignNotes] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handoversQuery = useQuery({
    queryKey: ['fsm-material-handovers', staff?.id],
    queryFn: () => listMaterialHandovers(staff!.id, 'pending'),
    enabled: !!staff,
  });

  const jobQuery = useQuery({
    queryKey: ['fsm-job', staff?.id, jobId],
    queryFn: () => getJob(staff!.id, jobId),
    enabled: !!staff && Number.isInteger(jobId),
  });

  const receiversQuery = useQuery({
    queryKey: ['fsm-return-receivers'],
    queryFn: () => listReturnReceivers(staff!.id),
    enabled: !!staff,
  });

  /** The return we are signing for, if one is already waiting. */
  const handover = useMemo(() => {
    const rows = handoversQuery.data ?? [];
    if (Number.isFinite(targetHandoverId)) return rows.find((h) => h.id === targetHandoverId) ?? null;
    if (Number.isInteger(jobId)) return rows.find((h) => h.workOrderId === jobId) ?? null;
    return rows[0] ?? null;
  }, [handoversQuery.data, targetHandoverId, jobId]);

  /** Everything still signed out on this job. */
  const outstanding = useMemo(() => {
    const rows: Allocation[] = jobQuery.data?.allocations ?? [];
    return rows
      .map((a) => ({ a, left: round2(a.qtyAllocated - a.qtyReturned) }))
      .filter((r) => r.left > 0)
      // Tools first — those are the ones the office actually expects back.
      .sort((x, y) => Number(y.a.isReturnable) - Number(x.a.isReturnable));
  }, [jobQuery.data]);

  // Default every returnable (tool) line to "all of it back"; consumables stay
  // blank because they are normally used up on site.
  useEffect(() => {
    if (handover || outstanding.length === 0) return;
    setQty((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const next: Record<number, string> = {};
      for (const { a, left } of outstanding) if (a.isReturnable) next[a.id] = String(left);
      return next;
    });
  }, [handover, outstanding]);

  const declareMutation = useMutation({
    mutationFn: () =>
      declareMaterialReturn(staff!.id, jobId, {
        items: outstanding
          .map(({ a, left }) => ({
            allocationId: a.id,
            qtyReturned: Math.min(parseFloat(qty[a.id] ?? '0') || 0, left),
          }))
          .filter((i) => i.qtyReturned > 0),
        notes: declareNotes.trim() || undefined,
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['fsm-material-handovers'] });
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not record the return'),
  });

  const signMutation = useMutation({
    mutationFn: () =>
      signMaterialReturn(staff!.id, handover!.id, {
        receivedByStaffId: receiverId!,
        pin,
        signature: signature!,
        notes: signNotes.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fsm-material-handovers'] });
      void qc.invalidateQueries({ queryKey: ['fsm-job'] });
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not record the signature'),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => cancelMaterialReturn(staff!.id, handover!.id),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['fsm-material-handovers'] });
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not withdraw the return'),
  });

  const declaredTotal = outstanding.reduce(
    (s, { a, left }) => s + Math.min(parseFloat(qty[a.id] ?? '0') || 0, left),
    0,
  );
  const canDeclare = Number.isInteger(jobId) && declaredTotal > 0;
  const canSign = !!handover && !!receiverId && pin.length >= 4 && !!signature;
  // The technician handing the items in cannot also sign for them.
  const receivers = (receiversQuery.data ?? []).filter((r) => r.id !== handover?.staffId);

  const loading = handoversQuery.isLoading || (Number.isInteger(jobId) && jobQuery.isLoading);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="return-back-button"
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Return materials & tools</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          {handover ? (
            /* ── Stage 2: hand the phone over and get it signed ── */
            <>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {handover.workOrderNumber ?? `Job #${handover.workOrderId}`}
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Returned by {handover.staffName}. Hand the phone to whoever is receiving these items.
                </Text>
                {handover.items.map((it) => (
                  <View key={it.allocationId} style={styles.line}>
                    <Feather
                      name={it.isReturnable ? 'tool' : 'package'}
                      size={14}
                      color={it.isReturnable ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[styles.lineName, { color: colors.foreground }]} numberOfLines={1}>
                      {it.description}
                    </Text>
                    <Text style={[styles.lineQty, { color: colors.foreground }]}>
                      {it.qtyReturned} {it.unit}
                    </Text>
                  </View>
                ))}
                {handover.notes ? (
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>“{handover.notes}”</Text>
                ) : null}
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Who is receiving the items?</Text>
                {receiversQuery.isLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : receivers.length === 0 ? (
                  <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                    Nobody else is set up to receive items. An admin can tick “can receive cash” on a staff member in
                    the office app, or give them a manager/supervisor role.
                  </Text>
                ) : (
                  receivers.map((r) => {
                    const active = receiverId === r.id;
                    return (
                      <Pressable
                        key={r.id}
                        testID={`return-receiver-${r.id}`}
                        onPress={() => { setReceiverId(r.id); setError(null); }}
                        style={[styles.option, {
                          borderColor: active ? colors.primary : colors.border,
                          backgroundColor: active ? colors.primary + '18' : 'transparent',
                        }]}
                      >
                        <Feather
                          name={active ? 'check-circle' : 'circle'}
                          size={16}
                          color={active ? colors.primary : colors.mutedForeground}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.optionName, { color: colors.foreground }]}>{r.name}</Text>
                          {r.role ? (
                            <Text style={[styles.optionRole, { color: colors.mutedForeground }]}>{r.role}</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Receiver's PIN</Text>
                <TextInput
                  testID="return-pin-input"
                  value={pin}
                  onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '')); setError(null); }}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={8}
                  placeholder="••••"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes (optional)</Text>
                <TextInput
                  testID="return-sign-notes-input"
                  value={signNotes}
                  onChangeText={setSignNotes}
                  placeholder="e.g. ladder came back scratched"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              </View>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Signature</Text>
                <SignaturePad
                  height={180}
                  onStrokesChange={(strokes, size) =>
                    setSignature(strokes.length > 0 ? strokesToSvgDataUrl(strokes, size.width || 300, size.height) : null)
                  }
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                testID="confirm-return-button"
                onPress={() => signMutation.mutate()}
                disabled={!canSign || signMutation.isPending}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !canSign || signMutation.isPending ? 0.5 : 1 }]}
              >
                {signMutation.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Sign for {handover.items.length} item{handover.items.length === 1 ? '' : 's'}</Text>
                )}
              </Pressable>

              {handover.staffId === staff?.id ? (
                <Pressable
                  testID="withdraw-return-button"
                  onPress={() => withdrawMutation.mutate()}
                  disabled={withdrawMutation.isPending}
                  style={[styles.secondaryBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                    Withdraw — the quantities are wrong
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : !Number.isInteger(jobId) ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              Nothing is waiting to be returned.
            </Text>
          ) : outstanding.length === 0 ? (
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>
              Everything dispatched to this job has already been returned or used up.
            </Text>
          ) : (
            /* ── Stage 1: declare what is coming back ── */
            <>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  {jobQuery.data?.workOrderNumber ?? 'This job'}
                </Text>
                <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                  Enter what you are bringing back. Stock only moves once someone at the office signs for it.
                </Text>
              </View>

              {outstanding.map(({ a, left }) => (
                <View key={a.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.line}>
                    <Feather
                      name={a.isReturnable ? 'tool' : 'package'}
                      size={16}
                      color={a.isReturnable ? colors.primary : colors.mutedForeground}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lineName, { color: colors.foreground }]} numberOfLines={1}>
                        {a.description}
                      </Text>
                      <Text style={[styles.optionRole, { color: colors.mutedForeground }]}>
                        {left} {a.unit} still out{a.isReturnable ? ' · tool' : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.qtyRow}>
                    <TextInput
                      testID={`return-qty-${a.id}`}
                      value={qty[a.id] ?? ''}
                      onChangeText={(t) => { setQty((p) => ({ ...p, [a.id]: t })); setError(null); }}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.qtyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    />
                    <Pressable
                      testID={`return-all-${a.id}`}
                      onPress={() => setQty((p) => ({ ...p, [a.id]: String(left) }))}
                      style={[styles.allBtn, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.allBtnText, { color: colors.mutedForeground }]}>All</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes (optional)</Text>
                <TextInput
                  testID="return-notes-input"
                  value={declareNotes}
                  onChangeText={setDeclareNotes}
                  placeholder="e.g. one drill bit broke on site"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                testID="declare-return-button"
                onPress={() => declareMutation.mutate()}
                disabled={!canDeclare || declareMutation.isPending}
                style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !canDeclare || declareMutation.isPending ? 0.5 : 1 }]}
              >
                {declareMutation.isPending ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue to signature</Text>
                )}
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  body: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineName: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  lineQty: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  allBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  allBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  optionName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  optionRole: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: 'Inter_400Regular' },
  primaryBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  secondaryBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
