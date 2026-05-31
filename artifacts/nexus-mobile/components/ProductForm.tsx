import { useQuery } from "@tanstack/react-query";
import {
  useCreateProduct,
  useListProducts,
  useUpdateProduct,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import {
  AppHeader,
  Button,
  Card,
  Field,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import {
  UnitDraft,
  UnitsEditor,
  TierDraft,
  VolumePricingEditor,
} from "@/components/PricingUnitsEditor";
import { useColors } from "@/hooks/useColors";
import {
  getPricingTiers,
  getPurchaseUnits,
  replacePricingTiers,
  replacePurchaseUnits,
} from "@/lib/nexus-api";

function FlagToggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
      }}
    >
      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>{label}</Text>
      <View
        style={{
          width: 46,
          height: 28,
          borderRadius: 14,
          padding: 3,
          backgroundColor: on ? c.accent : c.secondary,
          alignItems: on ? "flex-end" : "flex-start",
          justifyContent: "center",
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" }} />
      </View>
    </Pressable>
  );
}

export function ProductForm({ productId }: { productId?: number }) {
  const c = useColors();
  const pad = useScreenPadding();
  const router = useRouter();
  const isEdit = productId != null;

  const { data: products, isLoading: loadingProducts } = useListProducts();
  const existing = useMemo(
    () => (isEdit ? (products ?? []).find((p) => p.id === productId) : undefined),
    [products, productId, isEdit],
  );

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const tiersQuery = useQuery({
    queryKey: ["pricing-tiers", productId],
    queryFn: () => getPricingTiers(productId as number),
    enabled: isEdit,
  });
  const unitsQuery = useQuery({
    queryKey: ["purchase-units", productId],
    queryFn: () => getPurchaseUnits(productId as number),
    enabled: isEdit,
  });

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [stockCount, setStockCount] = useState("");
  const [description, setDescription] = useState("");
  const [isTaxable, setIsTaxable] = useState(true);
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [seeded, setSeeded] = useState(false);
  // If create succeeds but a follow-up tiers/units PUT fails, remember the new
  // product id so a retry UPDATES it instead of creating a duplicate.
  const createdIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEdit || seeded || !existing) return;
    setName(existing.name ?? "");
    setCategory(existing.category ?? "");
    setPrice(existing.price != null ? String(existing.price) : "");
    setCostPrice(existing.costPrice != null ? String(existing.costPrice) : "");
    setBarcode(existing.barcode ?? "");
    setStockCount(existing.stockCount != null ? String(existing.stockCount) : "");
    setDescription(existing.description ?? "");
    setIsTaxable(existing.isTaxable !== false);
    setSeeded(true);
  }, [existing, isEdit, seeded]);

  useEffect(() => {
    if (tiersQuery.data) {
      setTiers(
        tiersQuery.data.map((t) => ({
          minQty: String(t.minQty),
          maxQty: t.maxQty != null ? String(t.maxQty) : "",
          unitPrice: String(t.unitPrice),
        })),
      );
    }
  }, [tiersQuery.data]);

  useEffect(() => {
    if (unitsQuery.data) {
      setUnits(
        unitsQuery.data.map((u) => ({
          unitName: u.unitName,
          conversionFactor: String(u.conversionFactor),
          isPurchase: u.isPurchase,
          isSale: u.isSale,
        })),
      );
    }
  }, [unitsQuery.data]);

  const saving = createProduct.isPending || updateProduct.isPending;

  function buildTiers() {
    const cleaned = tiers
      .map((t) => ({
        minQty: Number(t.minQty),
        maxQty: t.maxQty.trim() === "" ? null : Number(t.maxQty),
        unitPrice: Number(t.unitPrice),
      }))
      .filter((t) => t.minQty > 0 && t.unitPrice >= 0);
    for (const t of cleaned) {
      if (t.maxQty != null && t.maxQty < t.minQty) {
        return { error: "A tier's max qty cannot be less than its min qty." };
      }
    }
    return { tiers: cleaned };
  }

  function buildUnits() {
    const baseUnit = "";
    const cleaned = units
      .map((u) => ({
        unitName: u.unitName.trim(),
        conversionFactor: Number(u.conversionFactor),
        isPurchase: u.isPurchase,
        isSale: u.isSale,
      }))
      .filter((u) => u.unitName !== "");
    const seen = new Set<string>();
    for (const u of cleaned) {
      if (u.conversionFactor <= 0) return { error: `Conversion for "${u.unitName}" must be greater than 0.` };
      if (!u.isPurchase && !u.isSale) return { error: `"${u.unitName}" must be a purchase unit, a sale unit, or both.` };
      const key = u.unitName.toLowerCase();
      if (seen.has(key)) return { error: `Duplicate unit name "${u.unitName}".` };
      seen.add(key);
    }
    return { units: cleaned };
  }

  async function onSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) return Alert.alert("Name required", "Please enter a product name.");
    if (!category.trim()) return Alert.alert("Category required", "Please enter a category.");
    const priceNum = Number(price);
    if (!(priceNum >= 0) || price.trim() === "") return Alert.alert("Price required", "Enter a valid price.");

    const tiersResult = buildTiers();
    if ("error" in tiersResult) return Alert.alert("Volume pricing", tiersResult.error);
    const unitsResult = buildUnits();
    if ("error" in unitsResult) return Alert.alert("Units", unitsResult.error);

    const body = {
      name: trimmedName,
      category: category.trim(),
      price: priceNum,
      costPrice: costPrice.trim() === "" ? undefined : Number(costPrice),
      barcode: barcode.trim() || undefined,
      stockCount: stockCount.trim() === "" ? undefined : Number(stockCount),
      description: description.trim() || undefined,
      isTaxable,
    };

    try {
      let targetId: number;
      if (isEdit) {
        await updateProduct.mutateAsync({ id: productId as number, data: body });
        targetId = productId as number;
      } else if (createdIdRef.current != null) {
        // A prior submit already created the product; update it on retry so we
        // never create a duplicate.
        await updateProduct.mutateAsync({ id: createdIdRef.current, data: body });
        targetId = createdIdRef.current;
      } else {
        const created = await createProduct.mutateAsync({ data: body });
        targetId = (created as { id: number }).id;
        createdIdRef.current = targetId;
      }
      await replacePricingTiers(targetId, tiersResult.tiers);
      await replacePurchaseUnits(targetId, unitsResult.units);
      router.back();
    } catch (e) {
      Alert.alert("Could not save product", (e as Error).message);
    }
  }

  if (isEdit && (loadingProducts || tiersQuery.isLoading || unitsQuery.isLoading)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Edit product" onBack={() => router.back()} />
        <LoadingState label="Loading product…" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title={isEdit ? "Edit product" : "New product"} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: pad.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 14 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="Product name" />
          <Field label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Beverages" />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Price (J$)" value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Cost (J$)" value={costPrice} onChangeText={setCostPrice} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Stock" value={stockCount} onChangeText={setStockCount} placeholder="0" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="Optional" />
            </View>
          </View>
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="Optional" multiline />
          <FlagToggle on={isTaxable} label="Taxable" onPress={() => setIsTaxable((v) => !v)} />
        </Card>

        <VolumePricingEditor value={tiers} onChange={setTiers} />
        <UnitsEditor value={units} onChange={setUnits} />

        <Button label={isEdit ? "Save changes" : "Create product"} icon="check" onPress={onSubmit} loading={saving} />
      </ScrollView>
    </View>
  );
}
