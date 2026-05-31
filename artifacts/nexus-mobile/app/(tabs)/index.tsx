import { Feather } from "@expo/vector-icons";
import {
  useCreateOrder,
  useGetSettings,
  useListCustomers,
  useListProducts,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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
  Stepper,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { CustomizeSheet } from "@/components/CustomizeSheet";
import { useCart, type CartLine } from "@/context/CartContext";
import { usePrinter } from "@/context/PrinterContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { printReceipt, type ReceiptItem, type ReceiptOrder, type ReceiptSettings } from "@/lib/escpos";
import { formatMoney } from "@/lib/format";

function isSimple(p: Product) {
  return !p.hasVariants && !p.hasModifiers && !p.isComposite;
}

// Products with variant or modifier groups need the customize sheet. Composite
// products without options are added directly (they have no choices to make).
function needsCustomization(p: Product) {
  return p.hasVariants || p.hasModifiers;
}

export default function SellScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const r = useResponsive();
  const cart = useCart();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: products, isLoading, error, refetch } = useListProducts();
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customizeProduct, setCustomizeProduct] = useState<Product | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  // The phone-only checkout modal must not survive a switch into the tablet
  // split-view (where the cart is always visible) — otherwise rotating back to
  // phone would re-open it unexpectedly.
  useEffect(() => {
    if (r.isTablet && checkoutOpen) setCheckoutOpen(false);
  }, [r.isTablet, checkoutOpen]);

  const filtered = useMemo(() => {
    const list = (products ?? []).filter((p) => !p.archivedAt);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q),
    );
  }, [products, search]);

  const onAdd = (p: Product) => {
    if (needsCustomization(p)) {
      setCustomizeProduct(p);
      return;
    }
    cart.add(p);
  };

  // Map each barcode to ALL active products carrying it, so a shared barcode is
  // surfaced for manual disambiguation rather than silently adding the wrong one.
  const barcodeToProductIds = useMemo(() => {
    const map = new Map<string, number[]>();
    (products ?? []).forEach((p) => {
      if (!p.barcode || p.archivedAt) return;
      const key = p.barcode.trim().toLowerCase();
      const arr = map.get(key) ?? [];
      arr.push(p.id);
      map.set(key, arr);
    });
    return map;
  }, [products]);

  const handleScan = (raw: string) => {
    const code = raw.trim().toLowerCase();
    const ids = barcodeToProductIds.get(code);
    if (!ids || ids.length === 0) {
      Alert.alert("No match", `No product found for barcode ${raw}.`);
      return;
    }
    if (ids.length > 1) {
      Alert.alert("Shared barcode", "Multiple products use this barcode. Add it from the list instead.");
      return;
    }
    const product = (products ?? []).find((p) => p.id === ids[0]);
    if (!product) return;
    setScanOpen(false);
    onAdd(product);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Sell" subtitle="Tap products to build a sale" />
        <LoadingState label="Loading products…" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Sell" />
        <ErrorState message="Could not load products." onRetry={refetch} />
      </View>
    );
  }

  const onCheckoutComplete = () => queryClient.invalidateQueries();

  // Column count for the product grid. In the tablet split-view the grid lives
  // in the (narrower) left pane, so we use one fewer column than full-width.
  const gridColumns = r.isTablet ? (r.isWide ? 3 : 2) : 2;

  const productGrid = (
    <FlatList
      key={`grid-${gridColumns}`}
      data={filtered}
      keyExtractor={(p) => String(p.id)}
      numColumns={gridColumns}
      columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
      contentContainerStyle={{
        gap: 12,
        paddingBottom: r.isTablet ? pad.bottom + 16 : pad.bottom + (cart.count > 0 ? 90 : 16),
      }}
      ListEmptyComponent={<EmptyState icon="search" title="No products found" />}
      renderItem={({ item }) => {
        const simple = isSimple(item);
        const out = !item.inStock || item.stockCount <= 0;
        return (
          <Pressable
            onPress={() => onAdd(item)}
            style={({ pressed }) => ({
              flex: 1 / gridColumns,
              backgroundColor: c.card,
              borderRadius: c.radius + 4,
              borderWidth: 1,
              borderColor: c.border,
              padding: 14,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: c.secondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="box" size={18} color={c.accent} />
              </View>
              {out ? <Badge label="Out" tone="danger" /> : <Badge label={`${item.stockCount}`} tone="success" />}
            </View>
            <Text
              numberOfLines={2}
              style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold"), minHeight: 40 }}
            >
              {item.name}
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("regular") }}>
              {item.category}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <Text style={{ color: c.accent, fontSize: 16, fontFamily: fontFamily("bold") }}>
                {formatMoney(item.price)}
              </Text>
              {!simple ? <Feather name="layers" size={16} color={c.mutedForeground} /> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );

  const searchRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, paddingBottom: 8 }}>
      <View style={{ flex: 1 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search products, SKU, barcode" />
      </View>
      <Pressable
        onPress={() => setScanOpen(true)}
        style={({ pressed }) => ({
          width: 50,
          height: 50,
          borderRadius: c.radius + 2,
          backgroundColor: c.secondary,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Feather name="maximize" size={20} color={c.accent} />
      </Pressable>
    </View>
  );

  const overlays = (
    <>
      <CustomizeSheet
        productId={customizeProduct?.id ?? null}
        visible={customizeProduct != null}
        onClose={() => setCustomizeProduct(null)}
        onAdd={({ unitPrice, variantChoices, modifierChoices }) => {
          if (customizeProduct) {
            cart.add(customizeProduct, { unitPrice, variantChoices, modifierChoices });
          }
          setCustomizeProduct(null);
        }}
      />
      <BarcodeScannerModal visible={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </>
  );

  /* ─────────── Tablet: products + persistent cart side-by-side ─────────── */
  const accountButton = (
    <Pressable onPress={() => router.push("/subscription")} hitSlop={8}>
      <Feather name="user" size={22} color={c.mutedForeground} />
    </Pressable>
  );

  if (r.isTablet) {
    const panelWidth = r.isWide ? 420 : 340;
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Sell" subtitle="Tap products to build a sale" right={accountButton} />
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            {searchRow}
            {productGrid}
          </View>
          <View
            style={{
              width: panelWidth,
              borderLeftWidth: 1,
              borderLeftColor: c.border,
              backgroundColor: c.background,
            }}
          >
            <CheckoutContent embedded onComplete={onCheckoutComplete} />
          </View>
        </View>
        {overlays}
      </View>
    );
  }

  /* ─────────── Phone: grid + floating cart bar + modal ─────────── */
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Sell" subtitle="Tap products to build a sale" right={accountButton} />

      {searchRow}

      {productGrid}

      {cart.count > 0 ? (
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: pad.bottom - 8,
          }}
        >
          <Pressable
            onPress={() => setCheckoutOpen(true)}
            style={({ pressed }) => ({
              backgroundColor: c.primary,
              borderRadius: c.radius + 4,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: pressed ? 0.9 : 1,
              shadowColor: "#000",
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  backgroundColor: "rgba(255,255,255,0.25)",
                  borderRadius: 999,
                  minWidth: 26,
                  height: 26,
                  paddingHorizontal: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontFamily: fontFamily("bold") }}>{cart.count}</Text>
              </View>
              <Text style={{ color: "#fff", fontSize: 16, fontFamily: fontFamily("semibold") }}>
                View cart
              </Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 16, fontFamily: fontFamily("bold") }}>
              {formatMoney(cart.subtotal)}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={checkoutOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setCheckoutOpen(false)}
      >
        <CheckoutContent
          onClose={() => setCheckoutOpen(false)}
          onComplete={onCheckoutComplete}
        />
      </Modal>

      {overlays}
    </View>
  );
}

function CheckoutContent({
  embedded,
  onClose,
  onComplete,
}: {
  embedded?: boolean;
  onClose?: () => void;
  onComplete: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const pad = useScreenPadding();
  const router = useRouter();
  const cart = useCart();
  const createOrder = useCreateOrder();
  const { data: customers } = useListCustomers();
  const { data: settingsData } = useGetSettings();
  const { config: printerConfig, ready: printerReady } = usePrinter();
  const [printing, setPrinting] = useState(false);

  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [discountFor, setDiscountFor] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptOrder | null>(null);

  const selectedCustomer = customers?.find((x) => x.id === customerId) ?? null;

  const receiptSettings: ReceiptSettings = {
    business_name: settingsData?.business_name,
    business_address: settingsData?.business_address,
    business_phone: settingsData?.business_phone,
    receipt_footer: settingsData?.receipt_footer,
    tax_rate: settingsData?.tax_rate,
    tax_name: settingsData?.tax_name,
    base_currency: settingsData?.base_currency,
  };

  const filteredCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    const list = customers ?? [];
    if (!q) return list.slice(0, 20);
    return list.filter((x) => x.name.toLowerCase().includes(q) || x.phone?.includes(q)).slice(0, 20);
  }, [customers, custSearch]);

  const reset = () => {
    setPayment("cash");
    setCustomerId(null);
    setShowCustomers(false);
    setCustSearch("");
  };

  const doPrint = async (order: ReceiptOrder) => {
    setPrinting(true);
    try {
      await printReceipt(printerConfig, order, receiptSettings);
    } catch (e) {
      Alert.alert("Print failed", e instanceof Error ? e.message : "Could not print the receipt.");
    } finally {
      setPrinting(false);
    }
  };

  const charge = async () => {
    if (cart.lines.length === 0) return;
    try {
      const lineSnapshot = cart.lines;
      const order = await createOrder.mutateAsync({
        data: {
          items: lineSnapshot.map((l) => {
            const discount = Math.min(Math.max(0, l.lineDiscount), l.unitPrice * l.quantity);
            return {
              productId: l.product.id,
              quantity: l.quantity,
              ...(l.variantChoices.length ? { variantChoices: l.variantChoices } : {}),
              ...(l.modifierChoices.length ? { modifierChoices: l.modifierChoices } : {}),
              ...(discount > 0 ? { discountAmount: discount } : {}),
            };
          }),
          paymentMethod: payment,
          ...(customerId ? { customerId } : {}),
        },
      });
      const items: ReceiptItem[] = lineSnapshot.map((l) => {
        const discount = Math.min(Math.max(0, l.lineDiscount), l.unitPrice * l.quantity);
        return {
          quantity: l.quantity,
          productName: l.product.name,
          unitPrice: l.unitPrice,
          lineTotal: l.unitPrice * l.quantity - discount,
          variantChoices: l.variantChoices.map((v) => ({ optionName: v.optionName })),
          modifierChoices: l.modifierChoices.map((m) => ({ optionName: m.optionName })),
        };
      });
      const receiptOrder: ReceiptOrder = {
        orderNumber: order.orderNumber,
        createdAt: new Date(),
        customerName: selectedCustomer?.name,
        items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        paymentMethod: payment === "cash" ? "Cash" : "Card",
      };
      setReceipt(receiptOrder);
      cart.clear();
      reset();
      onComplete();
      if (printerReady && printerConfig.enabled && printerConfig.autoPrint) {
        void doPrint(receiptOrder);
      }
    } catch (e) {
      Alert.alert("Checkout failed", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const empty = cart.lines.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: embedded ? 0 : insets.top }}>
      {/* Header */}
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
        <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>
          {receipt ? "Sale complete" : embedded ? "Current sale" : "Checkout"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={() => router.push("/printer-settings")} hitSlop={10}>
            <Feather name="printer" size={22} color={c.mutedForeground} />
          </Pressable>
          {onClose ? (
            <Pressable
              onPress={() => {
                if (receipt) setReceipt(null);
                onClose();
              }}
              hitSlop={10}
            >
              <Feather name="x" size={26} color={c.foreground} />
            </Pressable>
          ) : !receipt && !empty ? (
            <Pressable onPress={() => cart.clear()} hitSlop={10}>
              <Text style={{ color: c.destructive, fontSize: 14, fontFamily: fontFamily("medium") }}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {receipt ? (
        <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <View
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              backgroundColor: "rgba(34,197,94,0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="check" size={40} color="#4ADE80" />
          </View>
          <Text style={{ color: c.foreground, fontSize: 22, fontFamily: fontFamily("bold") }}>
            {formatMoney(receipt.total)}
          </Text>
          <Text style={{ color: c.mutedForeground, fontFamily: fontFamily("regular") }}>
            Order {receipt.orderNumber}
          </Text>
          <Card style={{ width: "100%", gap: 8 }}>
            <Row label="Subtotal" value={formatMoney(receipt.subtotal)} />
            <Row label="Tax" value={formatMoney(receipt.tax)} />
            <Divider />
            <Row label="Total" value={formatMoney(receipt.total)} bold />
          </Card>
          {printerConfig.enabled ? (
            <Button
              label={printing ? "Printing…" : "Print receipt"}
              icon="printer"
              variant="secondary"
              loading={printing}
              onPress={() => void doPrint(receipt)}
              style={{ width: "100%" }}
            />
          ) : null}
          <Button
            label="New Sale"
            icon="plus"
            onPress={() => {
              setReceipt(null);
              onClose?.();
            }}
            style={{ width: "100%" }}
          />
        </View>
      ) : empty && embedded ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState icon="shopping-cart" title="Cart is empty" subtitle="Tap products to add them to the sale." />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
            {cart.lines.map((l) => {
              const choices = [...l.variantChoices, ...l.modifierChoices]
                .map((ch) => ch.optionName)
                .join(" · ");
              const lineTotal = Math.max(0, l.unitPrice * l.quantity - l.lineDiscount);
              return (
                <Card key={l.lineKey} style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                        {l.product.name}
                      </Text>
                      {choices ? (
                        <Text numberOfLines={2} style={{ color: c.mutedForeground, fontSize: 12, marginTop: 2 }}>
                          {choices}
                        </Text>
                      ) : null}
                      <Text style={{ color: c.accent, fontSize: 14, fontFamily: fontFamily("medium"), marginTop: 2 }}>
                        {formatMoney(lineTotal)}
                        {l.lineDiscount > 0 ? (
                          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{`  (−${formatMoney(l.lineDiscount)})`}</Text>
                        ) : null}
                      </Text>
                    </View>
                    <Stepper value={l.quantity} onChange={(v) => cart.setQty(l.lineKey, v)} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Pressable
                      onPress={() => setDiscountFor(l.lineKey)}
                      hitSlop={6}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                    >
                      <Feather name="tag" size={14} color={c.mutedForeground} />
                      <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
                        {l.lineDiscount > 0 ? "Edit discount" : "Add discount"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => cart.remove(l.lineKey)} hitSlop={6}>
                      <Feather name="trash-2" size={16} color={c.destructive} />
                    </Pressable>
                  </View>
                </Card>
              );
            })}

            {/* Customer */}
            <Card style={{ gap: 10 }}>
              <Pressable
                onPress={() => setShowCustomers((s) => !s)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name="user" size={18} color={c.accent} />
                  <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>
                    {selectedCustomer ? selectedCustomer.name : "Attach customer (optional)"}
                  </Text>
                </View>
                <Feather name={showCustomers ? "chevron-up" : "chevron-down"} size={20} color={c.mutedForeground} />
              </Pressable>
              {selectedCustomer ? (
                <Pressable onPress={() => setCustomerId(null)}>
                  <Text style={{ color: c.destructive, fontSize: 13, fontFamily: fontFamily("medium") }}>
                    Remove customer
                  </Text>
                </Pressable>
              ) : null}
              {showCustomers ? (
                <View style={{ gap: 8 }}>
                  <SearchBar value={custSearch} onChangeText={setCustSearch} placeholder="Search customers" />
                  {filteredCustomers.map((cust) => (
                    <Pressable
                      key={cust.id}
                      onPress={() => {
                        setCustomerId(cust.id);
                        setShowCustomers(false);
                      }}
                      style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}
                    >
                      <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{cust.name}</Text>
                      {cust.phone ? (
                        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{cust.phone}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>

            {/* Payment */}
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium"), marginTop: 4 }}>
              PAYMENT METHOD
            </Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Chip label="Cash" active={payment === "cash"} onPress={() => setPayment("cash")} />
              <Chip label="Card" active={payment === "card"} onPress={() => setPayment("card")} />
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              padding: 16,
              paddingBottom: embedded ? pad.bottom + 16 : insets.bottom + 16,
              borderTopWidth: 1,
              borderTopColor: c.border,
              gap: 12,
              backgroundColor: c.card,
            }}
          >
            <Row label="Subtotal" value={formatMoney(cart.subtotal)} />
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              Tax is calculated on completion.
            </Text>
            <Button
              label={`Charge ${formatMoney(cart.subtotal)}`}
              icon="credit-card"
              onPress={charge}
              loading={createOrder.isPending}
              disabled={empty}
            />
          </View>
        </>
      )}

      <LineDiscountModal
        line={cart.lines.find((l) => l.lineKey === discountFor) ?? null}
        onClose={() => setDiscountFor(null)}
        onSave={(amt) => {
          if (discountFor) cart.setDiscount(discountFor, amt);
          setDiscountFor(null);
        }}
      />
    </View>
  );
}

function LineDiscountModal({
  line,
  onClose,
  onSave,
}: {
  line: CartLine | null;
  onClose: () => void;
  onSave: (amount: number) => void;
}) {
  const c = useColors();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(line && line.lineDiscount > 0 ? String(line.lineDiscount) : "");
  }, [line]);

  return (
    <Modal visible={!!line} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 20, gap: 16 }}>
          <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }} numberOfLines={1}>
            {line?.product.name}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Discount applied to the whole line.</Text>
          <Field
            label="Discount amount"
            value={value}
            onChangeText={setValue}
            placeholder="0"
            keyboardType="decimal-pad"
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Remove" variant="secondary" onPress={() => onSave(0)} style={{ flex: 1 }} />
            <Button label="Save" icon="check" onPress={() => onSave(parseFloat(value) || 0)} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: bold ? c.foreground : c.mutedForeground, fontSize: bold ? 16 : 14, fontFamily: fontFamily(bold ? "semibold" : "regular") }}>
        {label}
      </Text>
      <Text style={{ color: c.foreground, fontSize: bold ? 18 : 14, fontFamily: fontFamily(bold ? "bold" : "medium") }}>
        {value}
      </Text>
    </View>
  );
}
