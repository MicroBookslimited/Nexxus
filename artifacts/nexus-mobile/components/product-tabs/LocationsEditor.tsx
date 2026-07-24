import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Alert, Switch, Text, View } from "react-native";

import { Button, Card, EmptyState, ErrorState, Field, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  ProductLocationRow,
  getProductLocations,
  saveProductLocation,
  setLocationInventory,
} from "@/lib/nexus-api";

type DraftRow = {
  locationId: number;
  locationName: string;
  isAvailable: boolean;
  priceOverride: string;
  markupOverride: string;
  stockCount: string;
};

export function LocationsEditor({ productId }: { productId: number }) {
  const c = useColors();
  const qc = useQueryClient();
  const queryKey = ["product-locations", productId];
  const { data, isLoading, error, refetch } = useQuery<ProductLocationRow[]>({
    queryKey,
    queryFn: () => getProductLocations(productId),
  });

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data || seeded) return;
    setRows(
      data.map((r) => ({
        locationId: r.locationId,
        locationName: r.locationName,
        isAvailable: r.isAvailable,
        priceOverride: r.priceOverride != null ? String(r.priceOverride) : "",
        markupOverride: r.markupOverride != null ? String(r.markupOverride) : "",
        stockCount: r.stockCount != null ? String(r.stockCount) : "",
      })),
    );
    setSeeded(true);
  }, [data, seeded]);

  const patchRow = (id: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r) => (r.locationId === id ? { ...r, ...patch } : r)));

  async function onSave() {
    setSaving(true);
    try {
      for (const r of rows) {
        await saveProductLocation(productId, r.locationId, {
          isAvailable: r.isAvailable,
          priceOverride: r.priceOverride.trim() === "" ? null : Number(r.priceOverride),
          markupOverride: r.markupOverride.trim() === "" ? null : Number(r.markupOverride),
        });
        const original = (data ?? []).find((d) => d.locationId === r.locationId);
        const origStock = original?.stockCount != null ? String(original.stockCount) : "";
        if (r.stockCount.trim() !== origStock) {
          await setLocationInventory(r.locationId, productId, Number(r.stockCount) || 0);
        }
      }
      setSeeded(false);
      await qc.invalidateQueries({ queryKey });
      Alert.alert("Saved", "Location settings updated.");
    } catch (e) {
      Alert.alert("Could not save locations", (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <LoadingState label="Loading locations…" />;
  if (error) return <ErrorState message="Could not load locations." onRetry={refetch} />;
  if (rows.length === 0) return <EmptyState icon="map-pin" title="No locations" />;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
        Control availability, price overrides and stock for each business location.
      </Text>

      {rows.map((r) => (
        <Card key={r.locationId} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
              {r.locationName}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Available</Text>
              <Switch
                value={r.isAvailable}
                onValueChange={(v) => patchRow(r.locationId, { isAvailable: v })}
                trackColor={{ true: c.primary, false: c.border }}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Price override"
                value={r.priceOverride}
                onChangeText={(v) => patchRow(r.locationId, { priceOverride: v })}
                keyboardType="decimal-pad"
                placeholder="Default"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Markup % override"
                value={r.markupOverride}
                onChangeText={(v) => patchRow(r.locationId, { markupOverride: v })}
                keyboardType="decimal-pad"
                placeholder="Default"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Stock"
                value={r.stockCount}
                onChangeText={(v) => patchRow(r.locationId, { stockCount: v })}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>
        </Card>
      ))}

      <Button label="Save locations" icon="check" onPress={onSave} loading={saving} />
    </View>
  );
}
