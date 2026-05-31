import { Feather } from "@expo/vector-icons";
import { useGetSettings } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, Card, Field, fontFamily } from "@/components/ui";
import { usePrinter } from "@/context/PrinterContext";
import { useColors } from "@/hooks/useColors";
import { scanBleDevices, testPrint, type BleDevice, type PrinterTransport } from "@/lib/escpos";

const TRANSPORTS: { value: PrinterTransport; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { value: "network", label: "Network", icon: "wifi" },
  { value: "bluetooth", label: "Bluetooth", icon: "bluetooth" },
  { value: "usb", label: "USB", icon: "link" },
];

export default function PrinterSettings() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { config, update } = usePrinter();
  const { data: settings } = useGetSettings();

  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BleDevice[]>([]);
  const [testing, setTesting] = useState(false);

  const receiptSettings = {
    business_name: settings?.business_name,
    business_address: settings?.business_address,
    business_phone: settings?.business_phone,
    receipt_footer: settings?.receipt_footer,
    tax_rate: settings?.tax_rate,
    tax_name: settings?.tax_name,
    base_currency: settings?.base_currency,
  };

  const scan = async () => {
    setScanning(true);
    setDevices([]);
    try {
      const found = await scanBleDevices(6000);
      setDevices(found);
      if (found.length === 0) Alert.alert("No printers found", "Make sure the printer is on and in range.");
    } catch (e) {
      Alert.alert("Scan failed", e instanceof Error ? e.message : "Could not scan for devices.");
    } finally {
      setScanning(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      await testPrint(config, receiptSettings);
      Alert.alert("Test sent", "A test receipt was sent to the printer.");
    } catch (e) {
      Alert.alert("Test print failed", e instanceof Error ? e.message : "Could not print.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={24} color={c.foreground} />
        </Pressable>
        <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>Receipt Printer</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 40, maxWidth: 760, alignSelf: "center", width: "100%" }}>
        <Card style={{ gap: 14 }}>
          <ToggleRow
            label="Enable direct printing"
            hint="Send receipts straight to an ESC/POS printer."
            value={config.enabled}
            onChange={(v) => update({ enabled: v })}
          />
          <ToggleRow
            label="Auto-print on sale"
            hint="Print automatically when checkout completes."
            value={config.autoPrint}
            onChange={(v) => update({ autoPrint: v })}
          />
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 15 }}>Connection</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {TRANSPORTS.map((t) => {
              const active = config.transport === t.value;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => update({ transport: t.value })}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: c.radius,
                    backgroundColor: active ? c.primary : c.secondary,
                  }}
                >
                  <Feather name={t.icon} size={20} color={active ? "#FFFFFF" : c.secondaryForeground} />
                  <Text style={{ color: active ? "#FFFFFF" : c.secondaryForeground, fontFamily: fontFamily("medium"), fontSize: 13 }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {config.transport === "network" ? (
            <View style={{ gap: 12 }}>
              <Field
                label="Printer IP address"
                value={config.host ?? ""}
                onChangeText={(v) => update({ host: v })}
                placeholder="192.168.1.50"
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
              />
              <Field
                label="Port"
                value={String(config.port ?? 9100)}
                onChangeText={(v) => update({ port: Number(v.replace(/[^0-9]/g, "")) || 9100 })}
                placeholder="9100"
                keyboardType="number-pad"
              />
            </View>
          ) : null}

          {config.transport === "bluetooth" ? (
            <View style={{ gap: 10 }}>
              {config.deviceId ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Badge label="Selected" tone="success" />
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("medium"), flexShrink: 1 }}>
                    {config.deviceName ?? config.deviceId}
                  </Text>
                </View>
              ) : (
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("regular") }}>
                  No printer selected. Scan and pick a BLE printer.
                </Text>
              )}
              <Button label={scanning ? "Scanning…" : "Scan for printers"} icon="search" variant="secondary" loading={scanning} onPress={scan} />
              {devices.map((d) => (
                <Pressable
                  key={d.id}
                  onPress={() => update({ deviceId: d.id, deviceName: d.name })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    borderRadius: c.radius,
                    backgroundColor: c.secondary,
                  }}
                >
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("medium"), flexShrink: 1 }}>{d.name}</Text>
                  {config.deviceId === d.id ? <Feather name="check" size={18} color={c.accent} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          {config.transport === "usb" ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("regular") }}>
              {Platform.OS === "android"
                ? "Connect a USB ESC/POS printer to this device. You may be prompted to grant USB access on first print."
                : "USB printing is only available on Android. Use Network or Bluetooth on this device."}
            </Text>
          ) : null}
        </Card>

        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 15 }}>Paper width</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([32, 42] as const).map((w) => {
              const active = config.paperWidth === w;
              return (
                <Pressable
                  key={w}
                  onPress={() => update({ paperWidth: w })}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 12,
                    borderRadius: c.radius,
                    backgroundColor: active ? c.primary : c.secondary,
                  }}
                >
                  <Text style={{ color: active ? "#FFFFFF" : c.secondaryForeground, fontFamily: fontFamily("medium") }}>
                    {w === 32 ? "58 mm" : "80 mm"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Button label={testing ? "Printing…" : "Test print"} icon="printer" loading={testing} onPress={runTest} />

        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("regular"), textAlign: "center" }}>
          Direct printing needs a native development build — it does not work in Expo Go or the web preview.
        </Text>
      </ScrollView>
    </View>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ color: c.foreground, fontFamily: fontFamily("medium"), fontSize: 15 }}>{label}</Text>
        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("regular") }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.primary, false: c.border }} />
    </View>
  );
}
