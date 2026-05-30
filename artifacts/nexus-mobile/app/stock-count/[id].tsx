import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListProducts } from "@workspace/api-client-react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  applyStockCount,
  getStockCount,
  patchStockCountItem,
  type StockCountItem,
} from "@/lib/nexus-api";

export default function StockCountDetailScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = Number(id);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-count", sessionId],
    queryFn: () => getStockCount(sessionId),
    enabled: !isNaN(sessionId),
  });
  const { data: products } = useListProducts();

  const [scanOpen, setScanOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockCountItem | null>(null);

  // Synchronous mirror of physical counts so rapid scans read the latest value.
  const countsRef = useRef<Record<number, number>>({});
  // Per-item serialized writer: only ever one PATCH in flight per item, and the
  // server is always told the latest desired value. This prevents an out-of-order
  // network completion from overwriting a newer count (the PATCH is an absolute
  // last-write-wins overwrite on the server).
  const inFlight = useRef<Record<number, boolean>>({});

  const flushItem = useCallback(
    async (itemId: number) => {
      if (inFlight.current[itemId]) return;
      inFlight.current[itemId] = true;
      try {
        // Keep writing until the server reflects the latest local value.
        let lastSent: number | null = null;
        while (countsRef.current[itemId] !== lastSent) {
          const target: number = countsRef.current[itemId];
          lastSent = target;
          await patchStockCountItem(sessionId, itemId, target);
        }
      } catch (e) {
        Alert.alert("Sync failed", e instanceof Error ? e.message : "A count update did not save.");
      } finally {
        inFlight.current[itemId] = false;
        qc.invalidateQueries({ queryKey: ["stock-count", sessionId] });
      }
    },
    [sessionId, qc],
  );

  const setItemCount = useCallback(
    (itemId: number, value: number) => {
      countsRef.current[itemId] = value;
      void flushItem(itemId);
    },
    [flushItem],
  );

  const apply = useMutation({
    mutationFn: () => applyStockCount(sessionId, true),
    onSuccess: (res) => {
      qc.invalidateQueries();
      Alert.alert("Count applied", res.message ?? `Adjusted ${res.adjusted} items.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    },
    onError: (e) => Alert.alert("Failed", e instanceof Error ? e.message : "Try again."),
  });

  // Map each barcode to ALL products that carry it, so a shared barcode is
  // surfaced for manual disambiguation instead of silently counting the wrong one.
  const barcodeToProductIds = useMemo(() => {
    const map = new Map<string, number[]>();
    (products ?? []).forEach((p) => {
      if (!p.barcode) return;
      const key = p.barcode.trim().toLowerCase();
      const arr = map.get(key) ?? [];
      arr.push(p.id);
      map.set(key, arr);
    });
    return map;
  }, [products]);

  const done = data?.status === "completed" || data?.status === "applied";

  const handleScan = useCallback(
    (raw: string) => {
      const code = raw.trim().toLowerCase();
      const productIds = barcodeToProductIds.get(code);
      if (!productIds || productIds.length === 0) {
        Alert.alert("No match", `No product found for barcode ${raw}.`);
        return;
      }
      if (productIds.length > 1) {
        Alert.alert(
          "Shared barcode",
          "Multiple products use this barcode. Tap the item in the list and enter its count manually.",
        );
        return;
      }
      const item = data?.items.find((it) => it.productId === productIds[0]);
      if (!item) {
        Alert.alert("Not in this count", "That product isn't part of this count session.");
        return;
      }
      const current = countsRef.current[item.id] ?? item.physicalCount ?? 0;
      setItemCount(item.id, current + 1);
    },
    [barcodeToProductIds, data, setItemCount],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Stock Count" onBack={() => router.back()} />
        <LoadingState label="Loading…" />
      </View>
    );
  }
  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Stock Count" onBack={() => router.back()} />
        <ErrorState message="Could not load this count." onRetry={refetch} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader
        title={data.name}
        subtitle={`${data.totalItems} items`}
        onBack={() => router.back()}
        right={
          done ? <Badge label="Completed" tone="success" /> : null
        }
      />

      {!done ? (
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Button label="Scan Barcode (+1)" icon="maximize" variant="secondary" onPress={() => setScanOpen(true)} />
        </View>
      ) : null}

      <FlatList
        data={data.items}
        keyExtractor={(it) => String(it.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, paddingBottom: pad.bottom + (done ? 16 : 90) }}
        ListEmptyComponent={<EmptyState icon="clipboard" title="No items" />}
        renderItem={({ item }) => {
          const counted = item.physicalCount;
          const disc = item.discrepancy;
          return (
            <Card onPress={done ? undefined : () => setEditItem(item)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: c.foreground, fontFamily: fontFamily("semibold") }}>
                  {item.productName}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>System: {item.systemCount}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ color: counted == null ? c.mutedForeground : c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>
                  {counted == null ? "—" : counted}
                </Text>
                {counted != null && disc != null && disc !== 0 ? (
                  <Badge label={`${disc > 0 ? "+" : ""}${disc}`} tone={disc > 0 ? "success" : "danger"} />
                ) : counted != null ? (
                  <Badge label="OK" tone="neutral" />
                ) : null}
              </View>
            </Card>
          );
        }}
      />

      {!done ? (
        <View style={{ position: "absolute", left: 16, right: 16, bottom: pad.bottom - 8 }}>
          <Button
            label="Apply Count"
            icon="check-circle"
            onPress={() =>
              Alert.alert("Apply count?", "This updates stock levels and posts adjustments.", [
                { text: "Cancel", style: "cancel" },
                { text: "Apply", onPress: () => apply.mutate() },
              ])
            }
            loading={apply.isPending}
          />
        </View>
      ) : null}

      <ScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
      <EditCountModal
        item={editItem}
        onClose={() => setEditItem(null)}
        onSave={(physicalCount) => {
          if (editItem) {
            setItemCount(editItem.id, physicalCount);
          }
          setEditItem(null);
        }}
      />
    </View>
  );
}

function ScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const onBarcode = (code: string) => {
    const now = Date.now();
    // Debounce duplicate reads of the same code within 1.2s.
    if (lastScan.current.code === code && now - lastScan.current.at < 1200) return;
    lastScan.current = { code, at: now };
    onScan(code);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <View style={{ flex: 1 }}>
          {!permission ? (
            <LoadingState />
          ) : !permission.granted ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
              <Feather name="camera-off" size={36} color={c.mutedForeground} />
              <Text style={{ color: "#fff", textAlign: "center", fontFamily: fontFamily("medium") }}>
                Camera access is needed to scan barcodes.
              </Text>
              <Button label="Grant Access" icon="camera" onPress={requestPermission} />
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
              }}
              onBarcodeScanned={({ data }) => onBarcode(data)}
            >
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: "70%",
                    height: 160,
                    borderWidth: 3,
                    borderColor: c.accent,
                    borderRadius: 16,
                    backgroundColor: "transparent",
                  }}
                />
                <Text style={{ color: "#fff", marginTop: 16, fontFamily: fontFamily("medium") }}>
                  Point at a barcode — each scan adds +1
                </Text>
              </View>
            </CameraView>
          )}
        </View>
        <View style={{ padding: 16, paddingBottom: insets.bottom + 16, backgroundColor: "#000" }}>
          <Button label="Done" icon="check" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function EditCountModal({
  item,
  onClose,
  onSave,
}: {
  item: StockCountItem | null;
  onClose: () => void;
  onSave: (physicalCount: number) => void;
}) {
  const c = useColors();
  const [value, setValue] = useState("");

  React.useEffect(() => {
    setValue(item?.physicalCount != null ? String(item.physicalCount) : "");
  }, [item]);

  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 20, gap: 16 }}>
          <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }} numberOfLines={1}>
            {item?.productName}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>System count: {item?.systemCount}</Text>
          <Field
            label="Physical count"
            value={value}
            onChangeText={setValue}
            placeholder="0"
            keyboardType="number-pad"
            autoFocus
          />
          <Button label="Save" icon="check" onPress={() => onSave(parseInt(value, 10) || 0)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
