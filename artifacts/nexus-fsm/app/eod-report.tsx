/**
 * End-of-day report for a closed (or open) technician shift.
 *
 * The technician can print it on their Bluetooth thermal printer, email it to
 * the office, or open the PDF. The cash-custody block at the bottom is the
 * important part: the money stays with the technician until an authorised
 * person signs for it here.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { usePrinter } from '@/context/PrinterContext';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { buildEodReportText, parseDenominations } from '@/lib/eod-report-text';
import { printRawText } from '@/lib/escpos';
import {
  emailSessionReport,
  getSessionReport,
  getSessionReportLink,
} from '@/lib/fsm-api';

const money = (n: number | null | undefined) => `$${(Math.round((n ?? 0) * 100) / 100).toFixed(2)}`;

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: tone ?? colors.mutedForeground }, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, { color: tone ?? colors.foreground }, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

export default function EodReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { staff } = useStaff();
  const { tenant } = useAuth();
  const { config } = usePrinter();
  const params = useLocalSearchParams<{ sessionId?: string }>();
  const sessionId = params.sessionId ? parseInt(String(params.sessionId), 10) : NaN;

  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reportQuery = useQuery({
    queryKey: ['fsm-eod-report', sessionId],
    queryFn: () => getSessionReport(staff!.id, sessionId),
    enabled: !!staff && Number.isFinite(sessionId),
  });
  const report = reportQuery.data ?? null;

  const denoms = useMemo(
    () => parseDenominations(report?.session.denominationBreakdown),
    [report?.session.denominationBreakdown],
  );

  const printMutation = useMutation({
    mutationFn: async () => {
      if (!report) throw new Error('Report not loaded');
      if (!config.enabled || !config.deviceId) {
        throw new Error('No Bluetooth printer set up. Open Printer settings first.');
      }
      const text = buildEodReportText(report, {
        businessName: tenant?.businessName,
        width: config.paperWidth,
      });
      await printRawText(config, text);
    },
    onSuccess: () => setStatus({ kind: 'ok', text: 'Sent to the printer.' }),
    onError: (e) => setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Print failed' }),
  });

  const emailMutation = useMutation({
    mutationFn: () => emailSessionReport(staff!.id, sessionId),
    onSuccess: (r) => setStatus({ kind: 'ok', text: `Emailed to ${r.sent.length} admin address${r.sent.length === 1 ? '' : 'es'}.` }),
    onError: (e) => setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Email failed' }),
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      const { url } = await getSessionReportLink(staff!.id, sessionId);
      await WebBrowser.openBrowserAsync(url);
    },
    onError: (e) => setStatus({ kind: 'err', text: e instanceof Error ? e.message : 'Could not open the PDF' }),
  });

  const variance =
    report && report.session.actualCash != null ? report.session.actualCash - report.expectedCash : null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="eod-back-button" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>End of Day</Text>
        <Pressable testID="eod-printer-settings-button" onPress={() => router.push('/printer-settings')} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="printer" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      {reportQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : reportQuery.error || !report ? (
        <Text style={[styles.err]}>{(reportQuery.error as Error)?.message ?? 'Report unavailable'}</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{report.session.staffName}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Shift #{report.session.id} · {new Date(report.session.openedAt).toLocaleString()}
              {report.session.closedAt ? ` → ${new Date(report.session.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ' · still open'}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Collected on jobs</Text>
            <Row label="Cash" value={money(report.woCashIn)} />
            <Row label="Card" value={money(report.woCardIn)} />
            {report.woTransferIn ? <Row label="Transfer" value={money(report.woTransferIn)} /> : null}
            <Row label="Total" value={money(report.woCashIn + report.woCardIn + report.woTransferIn)} strong />
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Cash reconciliation</Text>
            <Row label="Opening float" value={money(report.session.openingCash)} />
            <Row label="Payouts" value={`-${money(report.totalPayouts)}`} />
            <Row label="Expected cash" value={money(report.expectedCash)} strong />
            {report.session.actualCash != null ? <Row label="Counted cash" value={money(report.session.actualCash)} strong /> : null}
            {variance != null ? (
              <Row
                label={Math.abs(variance) < 0.005 ? 'Balanced' : variance > 0 ? 'Overage' : 'Shortage'}
                value={money(Math.abs(variance))}
                strong
                tone={Math.abs(variance) < 0.005 ? '#22C55E' : '#EF4444'}
              />
            ) : null}
          </View>

          {denoms.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Cash count</Text>
              {denoms.map((d) => (
                <Row key={d.value} label={`${money(d.value)} × ${d.count}`} value={money(d.value * d.count)} />
              ))}
            </View>
          ) : null}

          {report.payouts.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Payouts</Text>
              {report.payouts.map((p, i) => (
                <Row key={i} label={p.reason || 'Payout'} value={`-${money(p.amount)}`} />
              ))}
            </View>
          ) : null}

          {report.woPayments.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Transactions</Text>
              {report.woPayments.map((p, i) => (
                <Row
                  key={i}
                  label={`${p.workOrderNumber ?? 'Job'} · ${p.method}${p.customerName ? ` · ${p.customerName}` : ''}`}
                  value={money(p.amount)}
                />
              ))}
            </View>
          ) : null}

          {/* Cash custody — who is holding the money right now. */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: report.handover && report.handover.status === 'pending' ? '#EF4444' : colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Cash handover</Text>
            {!report.handover ? (
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>No cash to hand over from this shift.</Text>
            ) : report.handover.status === 'signed' ? (
              <>
                <Row label="Received by" value={report.handover.receivedByName ?? '—'} />
                <Row label="Amount" value={money(report.handover.receivedAmount ?? report.handover.amount)} strong />
                <Row label="Signed" value={report.handover.signedAt ? new Date(report.handover.signedAt).toLocaleString() : '—'} />
              </>
            ) : (
              <>
                <Text style={[styles.hint, { color: '#FCA5A5' }]}>
                  You are holding {money(report.handover.amount)}. It stays yours until an admin, manager or
                  authorised cash receiver signs for it.
                </Text>
                <Pressable
                  testID="hand-over-cash-button"
                  onPress={() => router.push({ pathname: '/cash-handover', params: { handoverId: String(report.handover!.id) } })}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={styles.primaryBtnText}>Hand over cash</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable
              testID="print-report-button"
              onPress={() => printMutation.mutate()}
              disabled={printMutation.isPending}
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              {printMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="printer" size={16} color={colors.foreground} />}
              <Text style={[styles.actionText, { color: colors.foreground }]}>Print</Text>
            </Pressable>
            <Pressable
              testID="email-report-button"
              onPress={() => emailMutation.mutate()}
              disabled={emailMutation.isPending}
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              {emailMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="mail" size={16} color={colors.foreground} />}
              <Text style={[styles.actionText, { color: colors.foreground }]}>Email</Text>
            </Pressable>
            <Pressable
              testID="pdf-report-button"
              onPress={() => pdfMutation.mutate()}
              disabled={pdfMutation.isPending}
              style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              {pdfMutation.isPending ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={16} color={colors.foreground} />}
              <Text style={[styles.actionText, { color: colors.foreground }]}>PDF</Text>
            </Pressable>
          </View>

          {status ? (
            <Text style={[styles.msg, { color: status.kind === 'ok' ? '#22C55E' : '#EF4444' }]}>{status.text}</Text>
          ) : null}
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
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  hint: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  rowValue: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  strong: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12, paddingVertical: 13 },
  actionText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  primaryBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  msg: { fontSize: 13, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  err: { color: '#EF4444', textAlign: 'center', marginTop: 48, fontFamily: 'Inter_400Regular' },
});
