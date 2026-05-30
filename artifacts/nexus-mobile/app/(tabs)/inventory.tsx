import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListProducts, type Product } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SearchBar,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatDate } from "@/lib/format";
import {
  createStockAdjustment,
  createStockCount,
  listStockAdjustments,
  listStockCounts,
} from "@/lib/nexus-api";

export default function InventoryScreen() {
  const c = useColors();
  const [tab, setTab] = useState<"counts" | "adjust">("counts");

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Inventory" subtitle="Counts & adjustments" />
      <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 }}>
        <Chip label="Stock Counts" active={tab === "counts"} onPress={() => setTab("counts")} />
        <Chip label="Adjustments" active={tab === "adjust"} onPress={() => setTab("adjust")} />
      </View>
      {tab === "counts" ? <StockCountsTab /> : <AdjustmentsTab />}
    </View>
  );
}

/* ───────────── Stock counts ───────────── */

function StockCountsTab() {
  const c = useColors();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const router = useRouter();
  const { tenant } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-counts"],
    queryFn: listStockCounts,
  });
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => createStockCount({ name: name.trim(), createdBy: tenant?.businessName ?? "Mobile" }),
    onSuccess: (res) => {
      setNewOpen(false);
      setName("");
      qc.invalidateQueries({ queryKey: ["stock-counts"] });
      router.push(`/stock-count/${res.id}`);
    },
    onError: (e) => Alert.alert("Failed", e instanceof Error ? e.message : "Try again."),
  });

  if (isLoading) return <LoadingState label="Loading counts…" />;
  if (error) return <ErrorState message="Could not load stock counts." onRetry={refetch} />;

  return (
    <>
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 8,
          gap: 10,
          paddingBottom: pad.bottom + 80,
          width: "100%",
          maxWidth: lay.contentMaxWidth,
          alignSelf: "center",
        }}
        ListEmptyComponent={<EmptyState icon="clipboard" title="No stock counts" subtitle="Start one to reconcile inventory." />}
        renderItem={({ item }) => {
          const done = item.status === "completed" || item.status === "applied";
          return (
            <Card onPress={() => router.push(`/stock-count/${item.id}`)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("semibold"), flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Badge label={done ? "Completed" : "In progress"} tone={done ? "success" : "warning"} />
              </View>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                {item.totalItems} items · {formatDate(item.startedAt)}
              </Text>
            </Card>
          );
        }}
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pad.bottom - 8, alignItems: "center", paddingHorizontal: 16 }}>
        <View style={{ width: "100%", maxWidth: lay.contentMaxWidth }}>
          <Button label="New Count" icon="plus" onPress={() => setNewOpen(true)} />
        </View>
      </View>

      <Modal visible={newOpen} transparent animationType="fade" onRequestClose={() => setNewOpen(false)}>
        <Pressable
          onPress={() => setNewOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}
        >
          <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 20, gap: 16 }}>
            <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>New stock count</Text>
            <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Monthly count" autoFocus />
            <Button
              label="Create"
              icon="check"
              onPress={() => {
                if (!name.trim()) {
                  Alert.alert("Name required");
                  return;
                }
                create.mutate();
              }}
              loading={create.isPending}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/* ───────────── Adjustments ───────────── */

function AdjustmentsTab() {
  const c = useColors();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["stock-adjustments"],
    queryFn: () => listStockAdjustments(50),
  });
  const [formOpen, setFormOpen] = useState(false);

  if (isLoading) return <LoadingState label="Loading adjustments…" />;
  if (error) return <ErrorState message="Could not load adjustments." onRetry={refetch} />;

  return (
    <>
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 8,
          gap: 10,
          paddingBottom: pad.bottom + 80,
          width: "100%",
          maxWidth: lay.contentMaxWidth,
          alignSelf: "center",
        }}
        ListEmptyComponent={<EmptyState icon="sliders" title="No adjustments yet" />}
        renderItem={({ item }) => {
          const inc = item.adjustmentType === "increase";
          return (
            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: inc ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={inc ? "arrow-up" : "arrow-down"} size={18} color={inc ? "#4ADE80" : "#F87171"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: c.foreground, fontFamily: fontFamily("semibold") }}>
                  {item.productName}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                  {item.reason} · {formatDate(item.createdAt)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: inc ? "#4ADE80" : "#F87171", fontFamily: fontFamily("bold") }}>
                  {inc ? "+" : "-"}
                  {item.quantity}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 11 }}>→ {item.newStock}</Text>
              </View>
            </Card>
          );
        }}
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pad.bottom - 8, alignItems: "center", paddingHorizontal: 16 }}>
        <View style={{ width: "100%", maxWidth: lay.contentMaxWidth }}>
          <Button label="New Adjustment" icon="plus" onPress={() => setFormOpen(true)} />
        </View>
      </View>
      <AdjustmentFormModal visible={formOpen} onClose={() => setFormOpen(false)} onDone={refetch} />
    </>
  );
}

function AdjustmentFormModal({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tenant } = useAuth();
  const qc = useQueryClient();
  const { data: products } = useListProducts();

  const [product, setProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (products ?? []).filter((p) => !p.archivedAt);
    if (!q) return list.slice(0, 25);
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(q)).slice(0, 25);
  }, [products, search]);

  const submit = useMutation({
    mutationFn: () =>
      createStockAdjustment({
        productId: product!.id,
        adjustmentType: type,
        quantity: parseInt(qty, 10) || 0,
        reason: reason.trim() || "Manual adjustment",
        createdBy: tenant?.businessName ?? "Mobile",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-adjustments"] });
      qc.invalidateQueries();
      setProduct(null);
      setSearch("");
      setQty("");
      setReason("");
      onDone();
      onClose();
    },
    onError: (e) => Alert.alert("Failed", e instanceof Error ? e.message : "Try again."),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>New adjustment</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={26} color={c.foreground} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          {!product ? (
            <>
              <SearchBar value={search} onChangeText={setSearch} placeholder="Search a product" autoFocus />
              {filtered.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setProduct(p)}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}
                >
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{p.name}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                    {p.category} · {p.stockCount} in stock
                  </Text>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold") }}>{product.name}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Current: {product.stockCount}</Text>
                </View>
                <Pressable onPress={() => setProduct(null)}>
                  <Text style={{ color: c.accent, fontFamily: fontFamily("medium") }}>Change</Text>
                </Pressable>
              </Card>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Chip label="Increase" active={type === "increase"} onPress={() => setType("increase")} />
                <Chip label="Decrease" active={type === "decrease"} onPress={() => setType("decrease")} />
              </View>
              <Field label="Quantity" value={qty} onChangeText={setQty} placeholder="0" keyboardType="number-pad" />
              <Field label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Damage, recount" />
              <Button
                label="Apply Adjustment"
                icon="check"
                onPress={() => {
                  if ((parseInt(qty, 10) || 0) <= 0) {
                    Alert.alert("Enter a quantity");
                    return;
                  }
                  submit.mutate();
                }}
                loading={submit.isPending}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
