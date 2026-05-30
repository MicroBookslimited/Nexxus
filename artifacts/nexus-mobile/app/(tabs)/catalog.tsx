import { Feather } from "@expo/vector-icons";
import { useListProducts } from "@workspace/api-client-react";
import React, { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

import {
  AppHeader,
  Badge,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchBar,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatMoney } from "@/lib/format";

export default function CatalogScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const r = useResponsive();
  const { data: products, isLoading, error, refetch } = useListProducts();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => {
      if (!p.archivedAt && p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => !p.archivedAt)
      .filter((p) => category === "All" || p.category === category)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q),
      );
  }, [products, search, category]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Catalog" subtitle={`${filtered.length} products`} />

      <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search products or barcode" />
      </View>

      {isLoading ? (
        <LoadingState label="Loading catalog…" />
      ) : error ? (
        <ErrorState message="Could not load products." onRetry={refetch} />
      ) : (
        <FlatList
          key={`cat-${r.listColumns}`}
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          numColumns={r.listColumns}
          columnWrapperStyle={r.listColumns > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
          ListHeaderComponent={
            <FlatList
              horizontal
              data={categories}
              keyExtractor={(x) => x}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}
              renderItem={({ item }) => (
                <Chip label={item} active={category === item} onPress={() => setCategory(item)} />
              )}
            />
          }
          contentContainerStyle={{
            paddingBottom: pad.bottom + 16,
            gap: 10,
            width: "100%",
            maxWidth: r.contentMaxWidth,
            alignSelf: "center",
          }}
          ListEmptyComponent={<EmptyState icon="search" title="No products" />}
          renderItem={({ item }) => {
            const out = !item.inStock || item.stockCount <= 0;
            const low = !out && item.stockCount <= 5;
            return (
              <View style={r.listColumns > 1 ? { flex: 1 } : { paddingHorizontal: 16 }}>
                <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: c.secondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="box" size={20} color={c.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{item.category}</Text>
                    {item.barcode ? (
                      <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>#{item.barcode}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={{ color: c.accent, fontSize: 16, fontFamily: fontFamily("bold") }}>
                      {formatMoney(item.price)}
                    </Text>
                    {out ? (
                      <Badge label="Out of stock" tone="danger" />
                    ) : low ? (
                      <Badge label={`Low · ${item.stockCount}`} tone="warning" />
                    ) : (
                      <Badge label={`${item.stockCount} in stock`} tone="success" />
                    )}
                  </View>
                </Card>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
