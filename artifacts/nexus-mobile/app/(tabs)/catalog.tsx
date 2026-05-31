import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useListProducts, type Product } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

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

const VIEW_KEY = "nexus_catalog_view";
type ViewMode = "list" | "card";

export default function CatalogScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const r = useResponsive();
  const router = useRouter();
  const { data: products, isLoading, error, refetch } = useListProducts();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  useEffect(() => {
    AsyncStorage.getItem(VIEW_KEY).then((v) => {
      if (v === "card" || v === "list") setViewMode(v);
    });
  }, []);

  const setView = (v: ViewMode) => {
    setViewMode(v);
    AsyncStorage.setItem(VIEW_KEY, v);
  };

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

  const columns = viewMode === "card" ? r.productColumns : r.listColumns;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader
        title="Catalog"
        subtitle={`${filtered.length} products`}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ViewToggle mode={viewMode} onChange={setView} />
            <Pressable
              onPress={() => router.push("/product/new")}
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: c.primary,
              }}
            >
              <Feather name="plus" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        }
      />

      <View style={{ padding: 16, paddingBottom: 8, gap: 12 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search products or barcode" />
      </View>

      {isLoading ? (
        <LoadingState label="Loading catalog…" />
      ) : error ? (
        <ErrorState message="Could not load products." onRetry={refetch} />
      ) : (
        <FlatList
          key={`cat-${viewMode}-${columns}`}
          data={filtered}
          keyExtractor={(p) => String(p.id)}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: 12, paddingHorizontal: 16 } : undefined}
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
          renderItem={({ item }) =>
            viewMode === "card" ? (
              <ProductTile
                product={item}
                grid={columns > 1}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            ) : (
              <ProductRow
                product={item}
                grid={columns > 1}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            )
          }
        />
      )}
    </View>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (v: ViewMode) => void }) {
  const c = useColors();
  const options: { value: ViewMode; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
    { value: "list", icon: "list" },
    { value: "card", icon: "grid" },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: c.secondary,
        borderRadius: 10,
        padding: 3,
      }}
    >
      {options.map((o) => {
        const active = mode === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            hitSlop={4}
            style={{
              width: 34,
              height: 32,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? c.card : "transparent",
            }}
          >
            <Feather name={o.icon} size={18} color={active ? c.accent : c.mutedForeground} />
          </Pressable>
        );
      })}
    </View>
  );
}

type ProductLike = Product;

function stockBadge(product: ProductLike) {
  const out = !product.inStock || product.stockCount <= 0;
  const low = !out && product.stockCount <= 5;
  if (out) return <Badge label="Out of stock" tone="danger" />;
  if (low) return <Badge label={`Low · ${product.stockCount}`} tone="warning" />;
  return <Badge label={`${product.stockCount} in stock`} tone="success" />;
}

function ProductRow({
  product,
  grid,
  onPress,
}: {
  product: ProductLike;
  grid: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <View style={grid ? { flex: 1 } : { paddingHorizontal: 16 }}>
      <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
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
            {product.name}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{product.category}</Text>
          {product.barcode ? (
            <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 2 }}>#{product.barcode}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ color: c.accent, fontSize: 16, fontFamily: fontFamily("bold") }}>
            {formatMoney(product.price)}
          </Text>
          {stockBadge(product)}
        </View>
      </Card>
    </View>
  );
}

function ProductTile({
  product,
  grid,
  onPress,
}: {
  product: ProductLike;
  grid: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <View style={grid ? { flex: 1 } : { paddingHorizontal: 16 }}>
      <Card onPress={onPress} style={{ gap: 10, flex: 1 }}>
        <View
          style={{
            height: 96,
            borderRadius: 12,
            backgroundColor: c.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="box" size={30} color={c.accent} />
        </View>
        <View style={{ gap: 2 }}>
          <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
            {product.name}
          </Text>
          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 12 }}>
            {product.category}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: c.accent, fontSize: 16, fontFamily: fontFamily("bold") }}>
            {formatMoney(product.price)}
          </Text>
        </View>
        {stockBadge(product)}
      </Card>
    </View>
  );
}
