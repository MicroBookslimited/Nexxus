/**
 * ProductForm — create and edit products on mobile.
 *
 * Sections mirror the web products form:
 *   1. Basic info  – name, category (with suggestions), price/cost/markup, SKU
 *   2. Details     – brand, size, selling unit, description
 *   3. Barcode     – text field + camera scanner
 *   4. Inventory   – stock count, in-stock toggle, sold-by-weight + unit,
 *                    track batches, FIFO/LIFO override
 *   5. Tax         – taxable toggle
 *   6. Volume pricing  (existing PricingUnitsEditor)
 *   7. Purchase units  (existing PricingUnitsEditor)
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCreateProduct,
  useListProducts,
  useUpdateProduct,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

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
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { useColors } from "@/hooks/useColors";
import {
  getPricingTiers,
  getPurchaseUnits,
  replacePricingTiers,
  replacePurchaseUnits,
} from "@/lib/nexus-api";

// ─── helpers ────────────────────────────────────────────────────────────────

type WeightUnit = "kg" | "lb" | "oz" | "g";
const WEIGHT_UNITS: WeightUnit[] = ["kg", "lb", "oz", "g"];

type StockMethod = "" | "fifo" | "lifo";

function toNum(s: string): number | undefined {
  const n = parseFloat(s.replace(/,/g, ""));
  return isFinite(n) ? n : undefined;
}

/** Markup is on cost: price = cost × (1 + markup/100) */
function calcPrice(cost: number, markup: number): string {
  return (cost * (1 + markup / 100)).toFixed(2);
}
function calcMarkup(price: number, cost: number): string {
  if (cost <= 0) return "";
  return (((price - cost) / cost) * 100).toFixed(2);
}

// ─── Toggle row ─────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>{label}</Text>
        {hint ? (
          <Text style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.border }}
      />
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.mutedForeground,
        fontSize: 12,
        fontFamily: fontFamily("semibold"),
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginBottom: -4,
      }}
    >
      {title}
    </Text>
  );
}

// ─── Option chips (horizontal) ───────────────────────────────────────────────

function OptionChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? c.primary : c.secondary,
                borderWidth: 1,
                borderColor: active ? c.primary : c.border,
              }}
            >
              <Text
                style={{
                  color: active ? c.primaryForeground : c.mutedForeground,
                  fontSize: 13,
                  fontFamily: fontFamily(active ? "semibold" : "medium"),
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Category suggestion chips ───────────────────────────────────────────────

function CategorySuggestions({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (c: string) => void;
}) {
  const c = useColors();
  if (categories.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
      {categories.map((cat) => (
        <Pressable
          key={cat}
          onPress={() => onSelect(cat)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: selected === cat ? c.primary : c.secondary,
            borderWidth: 1,
            borderColor: selected === cat ? c.primary : c.border,
          }}
        >
          <Text
            style={{
              color: selected === cat ? c.primaryForeground : c.mutedForeground,
              fontSize: 12,
              fontFamily: fontFamily("medium"),
            }}
          >
            {cat}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export function ProductForm({ productId }: { productId?: number }) {
  const c       = useColors();
  const pad     = useScreenPadding();
  const router  = useRouter();
  const qc      = useQueryClient();
  const isEdit  = productId != null;

  const { data: products, isLoading: loadingProducts } = useListProducts();

  const existing = useMemo(
    () => (isEdit ? (products ?? []).find((p) => p.id === productId) : undefined),
    [products, productId, isEdit],
  );

  // All existing categories for the suggestion chips
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    (products ?? []).forEach((p) => { if (!p.archivedAt && p.category) set.add(p.category); });
    return Array.from(set).sort();
  }, [products]);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const tiersQuery = useQuery({
    queryKey: ["pricing-tiers", productId],
    queryFn:  () => getPricingTiers(productId as number),
    enabled:  isEdit,
  });
  const unitsQuery = useQuery({
    queryKey: ["purchase-units", productId],
    queryFn:  () => getPurchaseUnits(productId as number),
    enabled:  isEdit,
  });

  // ── form state ──────────────────────────────────────────────────────────────
  const [name,          setName]          = useState("");
  const [category,      setCategory]      = useState("");
  const [price,         setPrice]         = useState("");
  const [costPrice,     setCostPrice]     = useState("");
  const [markup,        setMarkup]        = useState("");
  const [sku,           setSku]           = useState("");
  const [brand,         setBrand]         = useState("");
  const [size,          setSize]          = useState("");
  const [sellingUnit,   setSellingUnit]   = useState("");
  const [description,   setDescription]   = useState("");
  const [barcode,       setBarcode]       = useState("");
  const [stockCount,    setStockCount]    = useState("");
  const [inStock,       setInStock]       = useState(true);
  const [soldByWeight,  setSoldByWeight]  = useState(false);
  const [unitOfMeasure, setUnitOfMeasure] = useState<WeightUnit>("kg");
  const [trackBatches,  setTrackBatches]  = useState(false);
  const [stockMethod,   setStockMethod]   = useState<StockMethod>("");
  const [isTaxable,     setIsTaxable]     = useState(true);
  const [tiers,         setTiers]         = useState<TierDraft[]>([]);
  const [units,         setUnits]         = useState<UnitDraft[]>([]);
  const [scannerOpen,   setScannerOpen]   = useState(false);
  const [seeded,        setSeeded]        = useState(false);
  const createdIdRef = useRef<number | null>(null);

  // ── seed existing product for edit ─────────────────────────────────────────
  useEffect(() => {
    if (!isEdit || seeded || !existing) return;
    setName(existing.name ?? "");
    setCategory(existing.category ?? "");
    setPrice(existing.price != null ? String(existing.price) : "");
    setCostPrice(existing.costPrice != null ? String(existing.costPrice) : "");
    setMarkup(
      existing.costPrice != null && existing.price != null && existing.costPrice > 0
        ? calcMarkup(existing.price, existing.costPrice)
        : "",
    );
    setSku(existing.sku ?? "");
    setBrand(existing.brand ?? "");
    setSize((existing as any).size ?? "");
    setSellingUnit((existing as any).sellingUnit ?? "");
    setBarcode(existing.barcode ?? "");
    setStockCount(existing.stockCount != null ? String(existing.stockCount) : "");
    setInStock(existing.inStock !== false);
    setSoldByWeight((existing as any).soldByWeight === true);
    setUnitOfMeasure(((existing as any).unitOfMeasure as WeightUnit) || "kg");
    setTrackBatches((existing as any).trackBatches === true);
    setStockMethod(((existing as any).stockMethodOverride as StockMethod) ?? "");
    setIsTaxable(existing.isTaxable !== false);
    setDescription(existing.description ?? "");
    setSeeded(true);
  }, [existing, isEdit, seeded]);

  useEffect(() => {
    if (tiersQuery.data) {
      setTiers(tiersQuery.data.map((t) => ({
        minQty:    String(t.minQty),
        maxQty:    t.maxQty != null ? String(t.maxQty) : "",
        unitPrice: String(t.unitPrice),
      })));
    }
  }, [tiersQuery.data]);

  useEffect(() => {
    if (unitsQuery.data) {
      setUnits(unitsQuery.data.map((u) => ({
        unitName:         u.unitName,
        conversionFactor: String(u.conversionFactor),
        isPurchase:       u.isPurchase,
        isSale:           u.isSale,
      })));
    }
  }, [unitsQuery.data]);

  // ── markup ↔ price sync ────────────────────────────────────────────────────
  const handleCostChange = (v: string) => {
    setCostPrice(v);
    const cost = toNum(v);
    const m    = toNum(markup);
    if (cost != null && m != null) setPrice(calcPrice(cost, m));
  };
  const handleMarkupChange = (v: string) => {
    setMarkup(v);
    const cost = toNum(costPrice);
    const m    = toNum(v);
    if (cost != null && m != null) setPrice(calcPrice(cost, m));
  };
  const handlePriceChange = (v: string) => {
    setPrice(v);
    const p    = toNum(v);
    const cost = toNum(costPrice);
    if (p != null && cost != null && cost > 0) setMarkup(calcMarkup(p, cost));
  };

  // ── build + validate ────────────────────────────────────────────────────────
  function buildTiers() {
    const cleaned = tiers
      .map((t) => ({
        minQty:    Number(t.minQty),
        maxQty:    t.maxQty.trim() === "" ? null : Number(t.maxQty),
        unitPrice: Number(t.unitPrice),
      }))
      .filter((t) => t.minQty > 0 && t.unitPrice >= 0);
    for (const t of cleaned) {
      if (t.maxQty != null && t.maxQty < t.minQty)
        return { error: "A tier's max qty cannot be less than its min qty." };
    }
    return { tiers: cleaned };
  }

  function buildUnits() {
    const cleaned = units
      .map((u) => ({
        unitName:         u.unitName.trim(),
        conversionFactor: Number(u.conversionFactor),
        isPurchase:       u.isPurchase,
        isSale:           u.isSale,
      }))
      .filter((u) => u.unitName !== "");
    const seen = new Set<string>();
    for (const u of cleaned) {
      if (u.conversionFactor <= 0)
        return { error: `Conversion for "${u.unitName}" must be greater than 0.` };
      if (!u.isPurchase && !u.isSale)
        return { error: `"${u.unitName}" must be a purchase unit, a sale unit, or both.` };
      const key = u.unitName.toLowerCase();
      if (seen.has(key)) return { error: `Duplicate unit name "${u.unitName}".` };
      seen.add(key);
    }
    return { units: cleaned };
  }

  const saving = createProduct.isPending || updateProduct.isPending;

  async function onSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName)    return Alert.alert("Name required",     "Enter a product name.");
    if (!category.trim()) return Alert.alert("Category required", "Enter a category.");
    const priceNum = Number(price);
    if (!(priceNum >= 0) || price.trim() === "")
      return Alert.alert("Price required", "Enter a valid selling price.");

    const tiersResult = buildTiers();
    if ("error" in tiersResult) return Alert.alert("Volume pricing", tiersResult.error);
    const unitsResult = buildUnits();
    if ("error" in unitsResult) return Alert.alert("Units", unitsResult.error);

    const body = {
      name:        trimmedName,
      category:    category.trim(),
      price:       priceNum,
      description: description.trim() || undefined,
      barcode:     barcode.trim()     || undefined,
      sku:         sku.trim()         || undefined,
      brand:       brand.trim()       || undefined,
      size:        size.trim()        || undefined,
      sellingUnit: sellingUnit.trim() || undefined,
      costPrice:   costPrice.trim() === "" ? undefined : Number(costPrice),
      stockCount:  stockCount.trim() === "" ? undefined : Number(stockCount),
      inStock,
      soldByWeight,
      unitOfMeasure: soldByWeight ? unitOfMeasure : undefined,
      trackBatches,
      stockMethodOverride: stockMethod === "" ? null : stockMethod,
      isTaxable,
    };

    try {
      let targetId: number;
      if (isEdit) {
        await updateProduct.mutateAsync({ id: productId as number, data: body });
        targetId = productId as number;
      } else if (createdIdRef.current != null) {
        await updateProduct.mutateAsync({ id: createdIdRef.current, data: body });
        targetId = createdIdRef.current;
      } else {
        const created = await createProduct.mutateAsync({ data: body });
        targetId = (created as { id: number }).id;
        createdIdRef.current = targetId;
      }
      await replacePricingTiers(targetId, tiersResult.tiers);
      await replacePurchaseUnits(targetId, unitsResult.units);
      qc.invalidateQueries({ queryKey: ["/api/products"] });
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

  const cur = toNum(costPrice);
  const pr  = toNum(price);
  const margin =
    cur != null && pr != null && pr > 0
      ? (((pr - cur) / pr) * 100).toFixed(1)
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title={isEdit ? "Edit product" : "New product"} onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: pad.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Basic Info ──────────────────────────────────────────────── */}
        <SectionHeader title="Basic info" />
        <Card style={{ gap: 14 }}>
          <Field label="Product name *" value={name} onChangeText={setName} placeholder="e.g. Coca-Cola 500ml" />

          <View style={{ gap: 6 }}>
            <Field label="Category *" value={category} onChangeText={setCategory} placeholder="e.g. Beverages" />
            <CategorySuggestions
              categories={existingCategories}
              selected={category}
              onSelect={setCategory}
            />
          </View>

          <Field label="SKU" value={sku} onChangeText={setSku} placeholder="e.g. SKU-0001" />
        </Card>

        {/* ── 2. Pricing ─────────────────────────────────────────────────── */}
        <SectionHeader title="Pricing" />
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Selling price *"
                value={price}
                onChangeText={handlePriceChange}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Cost price"
                value={costPrice}
                onChangeText={handleCostChange}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Markup %"
                value={markup}
                onChangeText={handleMarkupChange}
                placeholder="e.g. 30"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              {margin !== null ? (
                <View
                  style={{
                    backgroundColor: c.secondary,
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: fontFamily("medium") }}>
                    MARGIN
                  </Text>
                  <Text style={{ color: c.accent, fontSize: 18, fontFamily: fontFamily("bold") }}>
                    {margin}%
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: c.secondary,
                    borderRadius: 10,
                    padding: 12,
                    alignItems: "center",
                    opacity: 0.4,
                  }}
                >
                  <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Enter cost for margin</Text>
                </View>
              )}
            </View>
          </View>
        </Card>

        {/* ── 3. Details ─────────────────────────────────────────────────── */}
        <SectionHeader title="Details" />
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="e.g. Coca-Cola" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Size" value={size} onChangeText={setSize} placeholder="e.g. 500ml" />
            </View>
          </View>
          <Field
            label="Selling unit"
            value={sellingUnit}
            onChangeText={setSellingUnit}
            placeholder="e.g. each, case, pack"
          />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional product description"
            multiline
          />
        </Card>

        {/* ── 4. Barcode ─────────────────────────────────────────────────── */}
        <SectionHeader title="Barcode" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Field label="Barcode" value={barcode} onChangeText={setBarcode} placeholder="Scan or type barcode" />
            </View>
            <Pressable
              onPress={() => setScannerOpen(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                backgroundColor: c.secondary,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              {/* Feather "camera" icon */}
              <Text style={{ color: c.accent, fontSize: 20 }}>📷</Text>
            </Pressable>
          </View>
          {barcode.trim() ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              Barcode: <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{barcode}</Text>
            </Text>
          ) : null}
        </Card>

        {/* ── 5. Inventory ───────────────────────────────────────────────── */}
        <SectionHeader title="Inventory" />
        <Card style={{ gap: 14 }}>
          <Field
            label="Opening stock"
            value={stockCount}
            onChangeText={setStockCount}
            placeholder="0"
            keyboardType="numeric"
          />

          <ToggleRow label="In stock" hint="Uncheck to hide this product on the POS." value={inStock} onChange={setInStock} />

          <ToggleRow
            label="Sold by weight"
            hint="Price is charged per unit weight (e.g. kg, lb)."
            value={soldByWeight}
            onChange={setSoldByWeight}
          />

          {soldByWeight ? (
            <OptionChips
              label="Weight unit"
              options={WEIGHT_UNITS.map((u) => ({ label: u, value: u }))}
              value={unitOfMeasure}
              onChange={setUnitOfMeasure}
            />
          ) : null}

          <ToggleRow
            label="Track batches / lots"
            hint="Enable batch tracking with lot numbers and expiry dates."
            value={trackBatches}
            onChange={setTrackBatches}
          />

          <OptionChips
            label="Stock deduction method"
            options={[
              { label: "Inherit from settings", value: "" as StockMethod },
              { label: "FIFO",                  value: "fifo"            },
              { label: "LIFO",                  value: "lifo"            },
            ]}
            value={stockMethod}
            onChange={setStockMethod}
          />
        </Card>

        {/* ── 6. Tax ─────────────────────────────────────────────────────── */}
        <SectionHeader title="Tax" />
        <Card>
          <ToggleRow
            label="Taxable"
            hint="When off, sales tax is not applied to this product at checkout."
            value={isTaxable}
            onChange={setIsTaxable}
          />
        </Card>

        {/* ── 7. Volume pricing ──────────────────────────────────────────── */}
        <VolumePricingEditor value={tiers} onChange={setTiers} />

        {/* ── 8. Purchase units ──────────────────────────────────────────── */}
        <UnitsEditor value={units} onChange={setUnits} />

        <Button
          label={saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          icon="check"
          onPress={onSubmit}
          loading={saving}
        />
      </ScrollView>

      {/* Barcode scanner */}
      <BarcodeScannerModal
        visible={scannerOpen}
        hint="Point at a barcode to fill it in"
        onScan={(code) => {
          setBarcode(code);
          setScannerOpen(false);
        }}
        onClose={() => setScannerOpen(false)}
      />
    </View>
  );
}
