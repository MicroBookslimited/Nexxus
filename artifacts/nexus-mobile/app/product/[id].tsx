import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useListProducts } from "@workspace/api-client-react";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/format";
import { getPricingTiers, getPurchaseUnits } from "@/lib/nexus-api";

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>{value}</Text>
    </View>
  );
}

export default function ProductDetailScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);

  const { data: products, isLoading, error, refetch } = useListProducts();
  const product = useMemo(() => (products ?? []).find((p) => p.id === productId), [products, productId]);

  const tiersQuery = useQuery({
    queryKey: ["pricing-tiers", productId],
    queryFn: () => getPricingTiers(productId),
    enabled: Number.isFinite(productId),
  });
  const unitsQuery = useQuery({
    queryKey: ["purchase-units", productId],
    queryFn: () => getPurchaseUnits(productId),
    enabled: Number.isFinite(productId),
  });

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Product" onBack={() => router.back()} />
        <LoadingState label="Loading…" />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Product" onBack={() => router.back()} />
        <ErrorState message="Product not found." onRetry={refetch} />
      </View>
    );
  }

  const outOfStock = !product.inStock || product.stockCount <= 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader
        title={product.name}
        subtitle={product.category}
        onBack={() => router.back()}
        right={<Button label="Edit" variant="secondary" icon="edit-2" onPress={() => router.push(`/product/edit/${productId}`)} />}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: pad.bottom + 32 }}>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.accent, fontSize: 26, fontFamily: fontFamily("bold") }}>{formatMoney(product.price)}</Text>
            <Badge
              label={outOfStock ? "Out of stock" : `${product.stockCount} in stock`}
              tone={outOfStock ? "danger" : product.stockCount <= 5 ? "warning" : "success"}
            />
          </View>
          {product.description ? (
            <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>{product.description}</Text>
          ) : null}
          <Divider />
          {product.costPrice != null ? <Row label="Cost" value={formatMoney(product.costPrice)} /> : null}
          {product.barcode ? <Row label="Barcode" value={product.barcode} /> : null}
          <Row label="Taxable" value={product.isTaxable === false ? "No" : "Yes"} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("semibold") }}>Volume pricing</Text>
          {tiersQuery.isLoading ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Loading…</Text>
          ) : (tiersQuery.data ?? []).length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>No volume tiers configured.</Text>
          ) : (
            (tiersQuery.data ?? []).map((t, i) => (
              <View key={t.id ?? i} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
                <Text style={{ color: c.foreground, fontSize: 14 }}>
                  {t.minQty}
                  {t.maxQty != null ? `–${t.maxQty}` : "+"} units
                </Text>
                <Text style={{ color: c.accent, fontSize: 14, fontFamily: fontFamily("semibold") }}>
                  {formatMoney(t.unitPrice)} ea
                </Text>
              </View>
            ))
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("semibold") }}>Purchase / sale units</Text>
          {unitsQuery.isLoading ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Loading…</Text>
          ) : (unitsQuery.data ?? []).length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>No alternate units configured.</Text>
          ) : (
            (unitsQuery.data ?? []).map((u, i) => (
              <View key={u.id ?? i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
                <View>
                  <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium") }}>{u.unitName}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>× {u.conversionFactor} base units</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {u.isPurchase ? <Badge label="Purchase" tone="accent" /> : null}
                  {u.isSale ? <Badge label="Sale" tone="success" /> : null}
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </View>
  );
}
