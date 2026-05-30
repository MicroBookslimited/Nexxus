import { Feather } from "@expo/vector-icons";
import {
  useCreateOrder,
  useListCustomers,
  useListProducts,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
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
import { useCart } from "@/context/CartContext";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/format";

function isSimple(p: Product) {
  return !p.hasVariants && !p.hasModifiers && !p.isComposite;
}

export default function SellScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const cart = useCart();
  const queryClient = useQueryClient();

  const { data: products, isLoading, error, refetch } = useListProducts();
  const [search, setSearch] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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
    if (!isSimple(p)) {
      Alert.alert("Use full POS", `"${p.name}" has variants or modifiers. Add it from the desktop POS.`);
      return;
    }
    cart.add(p);
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

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Sell" subtitle="Tap products to build a sale" />

      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder="Search products, SKU, barcode"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => String(p.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
        contentContainerStyle={{ gap: 12, paddingBottom: pad.bottom + (cart.count > 0 ? 90 : 16) }}
        ListEmptyComponent={<EmptyState icon="search" title="No products found" />}
        renderItem={({ item }) => {
          const simple = isSimple(item);
          const out = !item.inStock || item.stockCount <= 0;
          return (
            <Pressable
              onPress={() => onAdd(item)}
              style={({ pressed }) => ({
                flex: 1,
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

      <CheckoutModal
        visible={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onComplete={() => {
          queryClient.invalidateQueries();
        }}
      />
    </View>
  );
}

function CheckoutModal({
  visible,
  onClose,
  onComplete,
}: {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const createOrder = useCreateOrder();
  const { data: customers } = useListCustomers();

  const [payment, setPayment] = useState<"cash" | "card">("cash");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [receipt, setReceipt] = useState<{ orderNumber: string; total: number; tax: number; subtotal: number } | null>(
    null,
  );

  const selectedCustomer = customers?.find((x) => x.id === customerId) ?? null;

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

  const charge = async () => {
    if (cart.lines.length === 0) return;
    try {
      const order = await createOrder.mutateAsync({
        data: {
          items: cart.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
          paymentMethod: payment,
          ...(customerId ? { customerId } : {}),
        },
      });
      setReceipt({
        orderNumber: order.orderNumber,
        total: order.total,
        tax: order.tax,
        subtotal: order.subtotal,
      });
      cart.clear();
      reset();
      onComplete();
    } catch (e) {
      Alert.alert("Checkout failed", e instanceof Error ? e.message : "Please try again.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
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
            {receipt ? "Sale complete" : "Checkout"}
          </Text>
          <Pressable
            onPress={() => {
              if (receipt) setReceipt(null);
              onClose();
            }}
            hitSlop={10}
          >
            <Feather name="x" size={26} color={c.foreground} />
          </Pressable>
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
            <Button
              label="New Sale"
              icon="plus"
              onPress={() => {
                setReceipt(null);
                onClose();
              }}
              style={{ width: "100%" }}
            />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
              {cart.lines.map((l) => (
                <Card key={l.product.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                      {l.product.name}
                    </Text>
                    <Text style={{ color: c.accent, fontSize: 14, fontFamily: fontFamily("medium"), marginTop: 2 }}>
                      {formatMoney(l.product.price * l.quantity)}
                    </Text>
                  </View>
                  <Stepper value={l.quantity} onChange={(v) => cart.setQty(l.product.id, v)} />
                </Card>
              ))}

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
                paddingBottom: insets.bottom + 16,
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
              />
            </View>
          </>
        )}
      </View>
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
