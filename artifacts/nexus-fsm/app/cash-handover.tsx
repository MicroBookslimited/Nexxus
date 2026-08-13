/**
 * Hand the day's cash to someone authorised.
 *
 * The technician passes the phone over; the receiver picks their name, enters
 * their PIN and signs. Nothing moves until that signature exists — which is
 * what protects the technician if money is later questioned.
 */
import React, { useMemo, useState } from 'react';
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
import { listCashHandovers, listCashReceivers, signCashHandover } from '@/lib/fsm-api';

const money = (n: number | null | undefined) => `$${(Math.round((n ?? 0) * 100) / 100).toFixed(2)}`;

export default function CashHandoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { staff } = useStaff();
  const params = useLocalSearchParams<{ handoverId?: string }>();
  const targetId = params.handoverId ? parseInt(String(params.handoverId), 10) : NaN;

  const [receiverId, setReceiverId] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [countedAmount, setCountedAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handoversQuery = useQuery({
    queryKey: ['fsm-handovers', staff?.id],
    queryFn: () => listCashHandovers(staff!.id, 'pending'),
    enabled: !!staff,
  });

  const receiversQuery = useQuery({
    queryKey: ['fsm-cash-receivers'],
    queryFn: () => listCashReceivers(staff!.id),
    enabled: !!staff,
  });

  const handover = useMemo(() => {
    const rows = handoversQuery.data ?? [];
    if (Number.isFinite(targetId)) return rows.find((h) => h.id === targetId) ?? null;
    return rows[0] ?? null;
  }, [handoversQuery.data, targetId]);

  const signMutation = useMutation({
    mutationFn: () =>
      signCashHandover(staff!.id, handover!.id, {
        receivedByStaffId: receiverId!,
        pin,
        signature: signature ?? undefined,
        receivedAmount: countedAmount.trim() ? parseFloat(countedAmount) : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fsm-handovers'] });
      qc.invalidateQueries({ queryKey: ['fsm-eod-report'] });
      router.back();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not record the handover'),
  });

  const canSign = !!handover && !!receiverId && pin.length >= 4 && !!signature;
  // The technician handing the money over cannot also be the one receiving it.
  const receivers = (receiversQuery.data ?? []).filter((r) => r.id !== handover?.staffId);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="handover-back-button" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Hand over cash</Text>
        <View style={{ width: 36 }} />
      </View>

      {handoversQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : !handover ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>
          No cash is waiting to be handed over.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.amount, { color: colors.foreground }]}>{money(handover.amount)}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Counted by {handover.staffName} at the close of shift #{handover.sessionId}.
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Who is receiving the cash?</Text>
            {receiversQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : receivers.length === 0 ? (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Nobody else is set up to receive cash. An admin can tick “can receive cash” on a staff member in the office app.
              </Text>
            ) : (
              receivers.map((r) => {
                const active = receiverId === r.id;
                return (
                  <Pressable
                    key={r.id}
                    testID={`receiver-${r.id}`}
                    onPress={() => { setReceiverId(r.id); setError(null); }}
                    style={[styles.option, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '18' : 'transparent' }]}
                  >
                    <Feather name={active ? 'check-circle' : 'circle'} size={16} color={active ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionName, { color: colors.foreground }]}>{r.name}</Text>
                      {r.role ? <Text style={[styles.optionRole, { color: colors.mutedForeground }]}>{r.role}</Text> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Receiver's PIN</Text>
            <TextInput
              testID="handover-pin-input"
              value={pin}
              onChangeText={(t) => { setPin(t.replace(/[^0-9]/g, '')); setError(null); }}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="••••"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Amount received (leave blank if the full amount)</Text>
            <TextInput
              testID="handover-amount-input"
              value={countedAmount}
              onChangeText={setCountedAmount}
              keyboardType="decimal-pad"
              placeholder={money(handover.amount)}
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
            />

            <Text style={[styles.label, { color: colors.mutedForeground }]}>Notes (optional)</Text>
            <TextInput
              testID="handover-notes-input"
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. short by 500, technician to explain"
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
            testID="confirm-handover-button"
            onPress={() => signMutation.mutate()}
            disabled={!canSign || signMutation.isPending}
            style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: !canSign || signMutation.isPending ? 0.5 : 1 }]}
          >
            {signMutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Sign for {money(handover.amount)}</Text>}
          </Pressable>
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
  amount: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  optionName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  optionRole: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  error: { color: '#EF4444', fontSize: 13, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  empty: { textAlign: 'center', marginTop: 48, fontSize: 14, fontFamily: 'Inter_400Regular' },
  primaryBtn: { borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
