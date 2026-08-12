/**
 * Cash shift — technicians use the same shift & cash management system the
 * POS uses. Open a shift with a starting float, watch expected cash grow as
 * onsite payments are recorded, log payouts, and close with a counted amount.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  addShiftPayout,
  closeShift,
  getCurrentShift,
  openShift,
} from '@/lib/fsm-api';

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function ShiftScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const qc = useQueryClient();

  const [openingCash, setOpeningCash] = useState('');
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutReason, setPayoutReason] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [countedCash, setCountedCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');

  const shiftQuery = useQuery({
    queryKey: ['fsm-shift', staff?.id],
    queryFn: () => getCurrentShift(staff!.id),
    enabled: !!staff,
  });
  const shift = shiftQuery.data ?? null;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['fsm-shift', staff?.id] });

  const openMutation = useMutation({
    mutationFn: () => openShift(staff!.id, staff!.name, parseFloat(openingCash) || 0),
    onSuccess: () => { setOpeningCash(''); invalidate(); },
  });

  const payoutMutation = useMutation({
    mutationFn: () =>
      addShiftPayout(staff!.id, shift!.session.id, {
        amount: parseFloat(payoutAmount),
        reason: payoutReason.trim(),
        staffName: staff!.name,
      }),
    onSuccess: () => { setPayoutOpen(false); setPayoutAmount(''); setPayoutReason(''); invalidate(); },
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closeShift(staff!.id, shift!.session.id, {
        actualCash: parseFloat(countedCash),
        // Card/transfer taken on the mobile machine settle outside the drawer;
        // declare them so the office can reconcile slips against the report.
        actualCard: shift!.woCardIn ?? 0,
        actualOther: shift!.woTransferIn ?? 0,
        closingNotes: closingNotes.trim() || undefined,
      }),
    onSuccess: () => { setCloseOpen(false); setCountedCash(''); setClosingNotes(''); invalidate(); },
  });

  const counted = parseFloat(countedCash);
  const variance = shift && Number.isFinite(counted) ? counted - shift.expectedCash : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="shift-back-button" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Cash Shift</Text>
        <View style={{ width: 36 }} />
      </View>

      {shiftQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : shiftQuery.error ? (
        <Text style={[styles.err, { color: '#EF4444' }]}>{(shiftQuery.error as Error).message}</Text>
      ) : !shift ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Open your shift</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Enter the cash float you're starting the day with. You must have an open shift before collecting payments on a job.
            </Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Starting float</Text>
            <TextInput
              testID="opening-cash-input"
              value={openingCash}
              onChangeText={setOpeningCash}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {openMutation.error ? (
              <Text style={[styles.err, { color: '#EF4444' }]}>{(openMutation.error as Error).message}</Text>
            ) : null}
            <Pressable
              testID="open-shift-button"
              disabled={openMutation.isPending || openingCash.trim() === '' || !(parseFloat(openingCash) >= 0)}
              onPress={() => openMutation.mutate()}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: openMutation.isPending || openingCash.trim() === '' ? 0.6 : 1 }]}
            >
              {openMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Open Shift</Text>}
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Shift open</Text>
              <View style={[styles.badge, { backgroundColor: '#10B98122' }]}>
                <Text style={{ color: '#10B981', fontSize: 12, fontWeight: '600' }}>OPEN</Text>
              </View>
            </View>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Since {new Date(shift.session.openedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </Text>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Starting float</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{money(shift.session.openingCash)}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Cash collected on jobs</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{money(shift.woCashIn ?? 0)}</Text>
            </View>
            {(shift.woCardIn ?? 0) > 0 || (shift.woTransferIn ?? 0) > 0 ? (
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Card / transfer (not in drawer)</Text>
                <Text style={[styles.statValue, { color: colors.mutedForeground }]}>{money((shift.woCardIn ?? 0) + (shift.woTransferIn ?? 0))}</Text>
              </View>
            ) : null}
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Payouts</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>−{money(shift.totalPayouts)}</Text>
            </View>
            <View style={[styles.statRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4 }]}>
              <Text style={[styles.statLabel, { color: colors.foreground, fontWeight: '700' }]}>Expected cash on hand</Text>
              <Text style={[styles.statValue, { color: colors.primary, fontWeight: '700' }]}>{money(shift.expectedCash)}</Text>
            </View>
          </View>

          <Pressable
            testID="payout-button"
            onPress={() => setPayoutOpen(true)}
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <Feather name="minus-circle" size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>Record Payout</Text>
          </Pressable>

          <Pressable
            testID="close-shift-button"
            onPress={() => { setCountedCash(''); setCloseOpen(true); }}
            style={[styles.primaryBtn, { backgroundColor: '#EF4444' }]}
          >
            <Text style={styles.primaryBtnText}>Close Shift</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* Payout modal */}
      <Modal visible={payoutOpen} transparent animationType="fade" onRequestClose={() => setPayoutOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Record Payout</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>Cash taken out of your float (fuel, small purchases, cash dropped at the office).</Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount</Text>
            <TextInput
              testID="payout-amount-input"
              value={payoutAmount}
              onChangeText={setPayoutAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Reason</Text>
            <TextInput
              testID="payout-reason-input"
              value={payoutReason}
              onChangeText={setPayoutReason}
              placeholder="e.g. Fuel"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {payoutMutation.error ? (
              <Text style={[styles.err, { color: '#EF4444' }]}>{(payoutMutation.error as Error).message}</Text>
            ) : null}
            <Pressable
              testID="payout-submit-button"
              disabled={payoutMutation.isPending || !(parseFloat(payoutAmount) > 0) || !payoutReason.trim()}
              onPress={() => payoutMutation.mutate()}
              style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: payoutMutation.isPending || !(parseFloat(payoutAmount) > 0) || !payoutReason.trim() ? 0.6 : 1 }]}
            >
              {payoutMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save Payout</Text>}
            </Pressable>
            <Pressable onPress={() => setPayoutOpen(false)} style={styles.cancelBtn}>
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Close-shift modal */}
      <Modal visible={closeOpen} transparent animationType="fade" onRequestClose={() => setCloseOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Close Shift</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Count the cash you're handing in. Expected: {shift ? money(shift.expectedCash) : '—'}
            </Text>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Counted cash</Text>
            <TextInput
              testID="counted-cash-input"
              value={countedCash}
              onChangeText={setCountedCash}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {variance != null ? (
              <Text style={[styles.hint, { color: Math.abs(variance) < 0.005 ? '#10B981' : '#F59E0B' }]}>
                {Math.abs(variance) < 0.005 ? 'Balanced' : variance > 0 ? `Over by ${money(variance)}` : `Short by ${money(-variance)}`}
              </Text>
            ) : null}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes (optional)</Text>
            <TextInput
              value={closingNotes}
              onChangeText={setClosingNotes}
              placeholder="Anything to note"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            {closeMutation.error ? (
              <Text style={[styles.err, { color: '#EF4444' }]}>{(closeMutation.error as Error).message}</Text>
            ) : null}
            <Pressable
              testID="close-shift-submit-button"
              disabled={closeMutation.isPending || !(parseFloat(countedCash) >= 0)}
              onPress={() => closeMutation.mutate()}
              style={[styles.primaryBtn, { backgroundColor: '#EF4444', opacity: closeMutation.isPending || countedCash.trim() === '' ? 0.6 : 1 }]}
            >
              {closeMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm & Close</Text>}
            </Pressable>
            <Pressable onPress={() => setCloseOpen(false)} style={styles.cancelBtn}>
              <Text style={{ color: colors.mutedForeground }}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  body: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginBottom: 12 },
  primaryBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  statLabel: { fontSize: 14 },
  statValue: { fontSize: 14, fontWeight: '600' },
  err: { fontSize: 13, marginBottom: 8, textAlign: 'center' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { borderWidth: 1, borderRadius: 14, padding: 18 },
});
