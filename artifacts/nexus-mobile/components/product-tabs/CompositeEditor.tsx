import {
  useGetCompositeComponents,
  useGetCompositeCost,
  useGetAvailableComposite,
  useSaveCompositeComponents,
  useListProducts,
  getGetCompositeComponentsQueryKey,
  getGetCompositeCostQueryKey,
  getGetAvailableCompositeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { Button, Card, Field, LoadingState, SearchBar, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/format";

type DraftComponent = { childProductId: number; childName: string; quantityRequired: string; costPrice: number | null };

export function CompositeEditor({ productId }: { productId: number }) {
  const c = useColors();
  const qc = useQueryClient();
  const { data: components, isLoading } = useGetCompositeComponents(productId);
  const { data: cost } = useGetCompositeCost(productId);
  const { data: availability } = useGetAvailableComposite(productId);
  const { data: products } = useListProducts();
  const saveComponents = useSaveCompositeComponents();

  const [drafts, setDrafts] = useState<DraftComponent[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!components || seeded) return;
    setDrafts(
      components.map((cp) => ({
        childProductId: cp.childProductId,
        childName: cp.childName,
        quantityRequired: String(cp.quantityRequired),
        costPrice: cp.childCostPrice ?? null,
      })),
    );
    setSeeded(true);
  }, [components, seeded]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(drafts.map((d) => d.childProductId));
    return (products ?? [])
      .filter((p) => !p.archivedAt && p.id !== productId && !chosen.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search, drafts, productId]);

  const derivedCost = drafts.reduce((sum, d) => {
    const qty = Number(d.quantityRequired) || 0;
    return sum + (d.costPrice ?? 0) * qty;
  }, 0);

  async function onSave() {
    const cleaned = drafts
      .map((d) => ({ childProductId: d.childProductId, quantityRequired: Number(d.quantityRequired) || 0 }))
      .filter((d) => d.quantityRequired > 0);
    if (cleaned.length === 0)
      return Alert.alert("Composite", "Add at least one component with a quantity above zero.");
    try {
      await saveComponents.mutateAsync({ id: productId, data: { components: cleaned } });
      setSeeded(false);
      await qc.invalidateQueries({ queryKey: getGetCompositeComponentsQueryKey(productId) });
      qc.invalidateQueries({ queryKey: getGetCompositeCostQueryKey(productId) });
      qc.invalidateQueries({ queryKey: getGetAvailableCompositeQueryKey(productId) });
      Alert.alert("Saved", "Bundle components updated.");
    } catch (e) {
      Alert.alert("Could not save components", (e as Error).message);
    }
  }

  if (isLoading) return <LoadingState label="Loading bundle…" />;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
        A composite product is a bundle assembled from other products — e.g. a "Case of 24".
        Its stock is derived from the stock of its components.
      </Text>

      {/* Cost summary */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryCard label="Selling price" value={formatMoney(cost?.sellingPrice ?? 0)} />
        <SummaryCard label="Derived cost" value={formatMoney(cost?.derivedCost ?? derivedCost)} />
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryCard label="Gross profit" value={formatMoney(cost?.grossProfit ?? 0)} />
        <SummaryCard label="Margin" value={`${(cost?.grossMarginPct ?? 0).toFixed(1)}%`} />
      </View>

      {availability ? (
        <Card style={{ gap: 6 }}>
          <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("semibold") }}>
            Can assemble: {availability.available}
          </Text>
          {availability.components.map((ac) => (
            <Text key={ac.childProductId} style={{ color: c.mutedForeground, fontSize: 12 }}>
              {ac.childName}: {ac.stock} in stock ÷ {ac.quantityRequired} needed = {ac.possibleBundles} bundles
            </Text>
          ))}
        </Card>
      ) : null}

      {/* Components */}
      <Card style={{ gap: 12 }}>
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>Components</Text>
        {drafts.length === 0 ? (
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>No components yet — search below to add products.</Text>
        ) : (
          drafts.map((d) => (
            <View key={d.childProductId} style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
              <View style={{ flex: 2 }}>
                <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium"), marginBottom: 4 }} numberOfLines={1}>
                  {d.childName}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
                  Cost {d.costPrice != null ? formatMoney(d.costPrice) : "—"} · Line{" "}
                  {formatMoney((d.costPrice ?? 0) * (Number(d.quantityRequired) || 0))}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Qty"
                  value={d.quantityRequired}
                  onChangeText={(v) =>
                    setDrafts((ds) => ds.map((x) => (x.childProductId === d.childProductId ? { ...x, quantityRequired: v } : x)))
                  }
                  keyboardType="numeric"
                  placeholder="1"
                />
              </View>
              <Pressable
                onPress={() => setDrafts((ds) => ds.filter((x) => x.childProductId !== d.childProductId))}
                hitSlop={8}
                style={{ paddingBottom: 12 }}
              >
                <Feather name="trash-2" size={18} color={c.destructive} />
              </Pressable>
            </View>
          ))
        )}

        <SearchBar value={search} onChangeText={setSearch} placeholder="Search products to add…" />
        {candidates.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => {
              setDrafts((ds) => [
                ...ds,
                { childProductId: p.id, childName: p.name, quantityRequired: "1", costPrice: p.costPrice ?? null },
              ]);
              setSearch("");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
              borderTopWidth: 1,
              borderTopColor: c.border,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium") }} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 11 }}>
                Stock {p.stockCount} · Cost {p.costPrice != null ? formatMoney(p.costPrice) : "—"}
              </Text>
            </View>
            <Feather name="plus-circle" size={20} color={c.accent} />
          </Pressable>
        ))}
      </Card>

      <Button label="Save components" icon="check" onPress={onSave} loading={saveComponents.isPending} />
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: fontFamily("medium") }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("bold") }}>{value}</Text>
    </Card>
  );
}
