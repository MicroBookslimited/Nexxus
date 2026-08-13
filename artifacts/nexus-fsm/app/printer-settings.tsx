/**
 * Bluetooth printer setup for the technician's pocket thermal printer.
 * Scan, pick a printer, choose the paper width, and test it — the choice is
 * remembered on the phone.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePrinter } from '@/context/PrinterContext';
import { useColors } from '@/hooks/useColors';
import { scanBleDevices, testPrint, type BleDevice } from '@/lib/escpos';

export default function PrinterSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, update } = usePrinter();

  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const scan = async () => {
    setMessage(null);
    setScanning(true);
    try {
      setDevices(await scanBleDevices(6000));
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Scan failed' });
    } finally {
      setScanning(false);
    }
  };

  const runTest = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await testPrint(config);
      setMessage({ kind: 'ok', text: 'Test sent to the printer.' });
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Print failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="printer-back-button" onPress={() => router.back()} style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Printer</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Bluetooth printing</Text>
              <Text style={[styles.hint, { color: colors.mutedForeground }]}>
                Turn on to print end-of-day reports on your portable thermal printer.
              </Text>
            </View>
            <Switch
              testID="printer-enabled-switch"
              value={config.enabled}
              onValueChange={(v) => update({ enabled: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Paper width</Text>
          <View style={styles.chipRow}>
            {([32, 42] as const).map((w) => {
              const active = config.paperWidth === w;
              return (
                <Pressable
                  key={w}
                  testID={`paper-width-${w}`}
                  onPress={() => update({ paperWidth: w })}
                  style={[
                    styles.chip,
                    { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '22' : 'transparent' },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {w === 32 ? '58 mm' : '80 mm'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Printer</Text>
            <Pressable testID="scan-printers-button" onPress={scan} disabled={scanning} style={[styles.smallBtn, { borderColor: colors.border }]}>
              {scanning ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.smallBtnText, { color: colors.primary }]}>Scan</Text>}
            </Pressable>
          </View>

          {config.deviceId ? (
            <Text style={[styles.selected, { color: colors.foreground }]}>
              Selected: {config.deviceName ?? config.deviceId}
            </Text>
          ) : (
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              No printer selected yet. Turn the printer on, then scan.
            </Text>
          )}

          {devices.map((d) => {
            const active = config.deviceId === d.id;
            return (
              <Pressable
                key={d.id}
                testID={`printer-device-${d.id}`}
                onPress={() => update({ deviceId: d.id, deviceName: d.name })}
                style={[styles.device, { borderColor: active ? colors.primary : colors.border }]}
              >
                <Feather name={active ? 'check-circle' : 'printer'} size={16} color={active ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.deviceName, { color: colors.foreground }]}>{d.name || d.id}</Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          testID="test-print-button"
          onPress={runTest}
          disabled={busy || !config.deviceId}
          style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: busy || !config.deviceId ? 0.5 : 1 }]}
        >
          {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryBtnText}>Test print</Text>}
        </Pressable>

        {message ? (
          <Text style={[styles.msg, { color: message.kind === 'ok' ? '#22C55E' : '#EF4444' }]}>{message.text}</Text>
        ) : null}

        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          Bluetooth printing needs the installed NEXXUS FSM app — it does not work in the web preview or Expo Go.
        </Text>
      </ScrollView>
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, minWidth: 64, alignItems: 'center' },
  smallBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  selected: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  deviceName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  msg: { fontSize: 13, textAlign: 'center', fontFamily: 'Inter_500Medium' },
  footnote: { fontSize: 12, lineHeight: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' },
});
