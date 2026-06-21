import { Feather } from "@expo/vector-icons";
import {
  useAuthenticateStaff,
  useCreateOrder,
  useGetSettings,
  useListCustomers,
  useListProducts,
  type Product,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  listPaymentMethods,
  lookupGiftVoucher,
  type PaymentMethod,
  type VoucherLookupResult,
} from "@/lib/nexus-api";

function isSimple(p: Product) {
  return !p.hasVariants && !p.hasModifiers && !p.isComposite;
}

// Products with variant or modifier groups need the customize sheet. Composite
// products without options are added directly (they have no choices to make).
function needsCustomization(p: Product) {
  return p.hasVariants || p.hasModifiers;
}

// Turn the raw server stock error (e.g. HTTP 409 'Cannot sell "Combo Plate Test":
// only 0 of "Gizzada" available (need 1)') into a friendly, cashier-readable
// message. Falls back to a generic message for anything we can't parse.
function friendlyCheckoutError(e: unknown): { title: string; message: string } {
  const raw = e instanceof Error ? e.message : "";
  const avail = raw.match(/only\s+(\d+)\s+of\s+"([^"]+)"\s+available\s+\(need\s+(\d+)\)/i);
  if (avail) {
    const have = Number(avail[1]);
    const component = avail[2];
    const sold = raw.match(/Cannot sell\s+"([^"]+)"/i)?.[1];
    // For a combo/recipe, name both the menu item and the missing ingredient.
    const isCombo = sold && sold !== component;
    if (have <= 0) {
      return {
        title: "Out of stock",
        message: isCombo
          ? `"${component}" is sold out, so "${sold}" can't be sold right now. Remove it from the cart or restock to continue.`
          : `"${component}" is sold out. Remove it from the cart or restock to continue.`,
      };
    }
    return {
      title: "Not enough stock",
      message: isCombo
        ? `Only ${have} "${component}" left — not enough for "${sold}". Reduce the quantity or restock.`
        : `Only ${have} "${component}" left. Reduce the quantity or restock to continue.`,
    };
  }
  return {
    title: "Checkout failed",
    message: raw || "Something went wrong. Please try again.",
  };
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

  // Column count for the product grid. Landscape (and wide tablets) show 3
  // columns of product cards; portrait phones/tablets stay at 2 to keep the
  // cards legible in the narrower width.
  const gridColumns = r.isWide || r.isLandscape ? 3 : 2;

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

  // Payment method value matches the web POS: built-in types ("cash", "card",
  // "split", "credit") use their type as the value; custom methods (e.g.
  // "Cheque", "Bank Transfer") use their name.
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  // Debit/credit choice for card payments (or the card portion of a split);
  // persisted on the order and printed on the receipt. NOT related to the
  // on-account "credit" payment method.
  const [cardType, setCardType] = useState<"debit" | "credit" | null>(null);
  const [splitCard, setSplitCard] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [discountFor, setDiscountFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [orderNote, setOrderNote] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [receipt, setReceipt] = useState<ReceiptOrder | null>(null);

  // Order-level discount (manager-PIN gated, mirroring the web POS). The
  // authorizer name is client-only UX (not sent to the server).
  const [discountType, setDiscountType] = useState<"percent" | "fixed" | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountAuthorizedBy, setDiscountAuthorizedBy] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  // Loyalty points redeemed against this sale (100 pts = $1).
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);
  // Gift voucher applied as a tender (pays down the amount due).
  const [voucherCode, setVoucherCode] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherLookupResult | null>(null);
  const [voucherBusy, setVoucherBusy] = useState(false);

  const authStaff = useAuthenticateStaff();

  const { data: pmData } = useQuery({
    queryKey: ["payment-methods"],
    queryFn: listPaymentMethods,
    staleTime: 5 * 60 * 1000,
  });

  const selectedCustomer = customers?.find((x) => x.id === customerId) ?? null;

  const taxRate = parseFloat(settingsData?.tax_rate || "15") / 100;
  const taxMode = (settingsData?.tax_mode as "exclusive" | "inclusive") ?? "exclusive";

  // Estimate tax + total client-side. This mirrors the server for the common
  // mobile case (no order-level discount or service charge). The server stays
  // authoritative on the saved order; this only drives the on-screen totals and
  // split-payment validation.
  const taxableNet = useMemo(
    () =>
      cart.lines.reduce(
        (s, l) =>
          l.product.isTaxable ? s + Math.max(0, l.effectiveUnitPrice * l.quantity - l.lineDiscount) : s,
        0,
      ),
    [cart.lines],
  );
  // Order-level discount + loyalty both reduce the goods subtotal before tax,
  // mirroring the server (orders.ts): discountValue clamped to subtotal,
  // loyalty at 100 pts = $1, then applied proportionally to the taxable bucket.
  const discountValue = useMemo(() => {
    if (!discountType || discountAmount <= 0) return 0;
    const v = discountType === "percent" ? cart.subtotal * (discountAmount / 100) : discountAmount;
    return Math.min(Math.round(v * 100) / 100, cart.subtotal);
  }, [discountType, discountAmount, cart.subtotal]);
  const loyaltyDiscount = loyaltyPointsToRedeem > 0 ? Math.round((loyaltyPointsToRedeem / 100) * 100) / 100 : 0;

  const discountedSubtotal = Math.max(0, Math.round((cart.subtotal - discountValue - loyaltyDiscount) * 100) / 100);
  const taxableFraction = cart.subtotal > 0 ? taxableNet / cart.subtotal : 1;
  const taxableDiscounted = Math.max(0, taxableNet - (discountValue + loyaltyDiscount) * taxableFraction);
  const tax =
    taxMode === "inclusive"
      ? Math.round(((taxableDiscounted * taxRate) / (1 + taxRate)) * 100) / 100
      : Math.round(taxableDiscounted * taxRate * 100) / 100;
  const total =
    taxMode === "inclusive"
      ? discountedSubtotal
      : Math.round((discountedSubtotal + tax) * 100) / 100;

  // Loyalty: 1 pt = $0.01, capped at the customer's balance and the goods
  // subtotal (after order discount) so points can't exceed what's owed.
  const maxRedeemable = selectedCustomer
    ? Math.min(selectedCustomer.loyaltyPoints, Math.max(0, Math.floor((cart.subtotal - discountValue) * 100)))
    : 0;

  // A gift voucher is a TENDER: it pays down `voucherApplied` of the total; the
  // remainder (amountDue) is collected via the chosen payment method.
  const voucherApplied = appliedVoucher
    ? Math.round(Math.min(Math.round(appliedVoucher.balance * 100) / 100, total) * 100) / 100
    : 0;
  const amountDue = Math.max(0, Math.round((total - voucherApplied) * 100) / 100);
  const voucherCoversAll = appliedVoucher != null && amountDue <= 0;

  const splitCardAmount = parseFloat(splitCard) || 0;
  const splitCashAmount = parseFloat(splitCash) || 0;
  // Split tendering settles the amount due (after any voucher), not the full total.
  const isSplitValid = Math.abs(splitCardAmount + splitCashAmount - amountDue) < 0.01;

  // Cash change-due (display only; never blocks checkout, matching the web POS).
  const tenderedAmount = parseFloat(cashTendered) || 0;
  const changeDue = tenderedAmount > 0 ? Math.max(0, Math.round((tenderedAmount - amountDue) * 100) / 100) : 0;

  // Tenant-enabled payment methods, falling back to the standard set when none
  // are configured (matches the web POS defaults).
  const paymentMethods = useMemo<Array<Pick<PaymentMethod, "id" | "type" | "name" | "isDefault">>>(() => {
    const enabled = (pmData ?? []).filter((m) => m.isEnabled);
    if (enabled.length > 0) return enabled;
    return [
      { id: -2, type: "cash", name: "Cash", isDefault: true },
      { id: -1, type: "card", name: "Card", isDefault: false },
      { id: -4, type: "credit", name: "Credit", isDefault: false },
      { id: -3, type: "split", name: "Split", isDefault: false },
    ];
  }, [pmData]);

  // Resolve the tenant's default method (isDefault, else first enabled). Used to
  // seed the selection and on reset, matching the web POS.
  const defaultPaymentMethod = useMemo(() => {
    const def = paymentMethods.find((m) => m.isDefault) ?? paymentMethods[0];
    if (!def) return "cash";
    return def.type === "custom" ? def.name : def.type;
  }, [paymentMethods]);

  const selectedMethod = paymentMethods.find(
    (m) => (m.type === "custom" ? m.name : m.type) === paymentMethod,
  );

  // Keep the selection valid: if the current method isn't in the enabled list
  // (initial load, or tenant disabled it), fall back to the resolved default.
  useEffect(() => {
    if (!selectedMethod) setPaymentMethod(defaultPaymentMethod);
  }, [selectedMethod, defaultPaymentMethod]);

  // Keep redeemed loyalty within bounds: if the customer is removed or the
  // redeemable cap shrinks (cart/discount changes), clamp the requested points.
  useEffect(() => {
    setLoyaltyPointsToRedeem((p) => (p > maxRedeemable ? maxRedeemable : p));
  }, [maxRedeemable]);
  const paymentLabel =
    paymentMethod === "cash"
      ? "Cash"
      : paymentMethod === "card"
        ? cardType === "debit"
          ? "Debit Card"
          : cardType === "credit"
            ? "Credit Card"
            : "Card"
        : paymentMethod === "credit"
          ? "On Account"
          : paymentMethod === "split"
            ? "Split (Card + Cash)"
            : selectedMethod?.name ?? paymentMethod;

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

  // Card payments (and the card portion of a split) must declare debit vs
  // credit so it can be printed on the receipt.
  const promptCardType = () => {
    Alert.alert("Card type", "Is this a debit or credit card?", [
      { text: "Debit Card", onPress: () => setCardType("debit") },
      { text: "Credit Card", onPress: () => setCardType("credit") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  // Selecting a payment method. Card/split prompt for debit-vs-credit; other
  // methods clear any prior card-type choice.
  const selectPaymentMethod = (m: Pick<PaymentMethod, "type" | "name">) => {
    const value = m.type === "custom" ? m.name : m.type;
    setPaymentMethod(value);
    if (m.type === "card" || m.type === "split") {
      setCardType(null);
      promptCardType();
    } else {
      setCardType(null);
    }
  };

  const reset = () => {
    setPaymentMethod(defaultPaymentMethod);
    setCardType(null);
    setSplitCard("");
    setSplitCash("");
    setCustomerId(null);
    setShowCustomers(false);
    setCustSearch("");
    setOrderNote("");
    setCashTendered("");
    setNoteFor(null);
    setDiscountType(null);
    setDiscountAmount(0);
    setDiscountAuthorizedBy(null);
    setDiscountOpen(false);
    setLoyaltyPointsToRedeem(0);
    setVoucherCode("");
    setAppliedVoucher(null);
    setVoucherBusy(false);
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
    // When a voucher covers the whole balance, the server takes a sentinel
    // payment method and skips the remainder (card/split/credit) validation.
    if (!voucherCoversAll) {
      if ((paymentMethod === "card" || paymentMethod === "split") && !cardType) {
        promptCardType();
        return;
      }
      if (paymentMethod === "credit" && !customerId) {
        Alert.alert("Customer required", "Select a customer to record an on-account (credit) sale.");
        return;
      }
      if (paymentMethod === "split" && !isSplitValid) {
        Alert.alert("Split doesn't add up", `Card + Cash must equal ${formatMoney(amountDue)}.`);
        return;
      }
    }
    const effectivePaymentMethod = voucherCoversAll ? "gift_voucher" : paymentMethod;
    try {
      const lineSnapshot = cart.lines;
      const order = await createOrder.mutateAsync({
        data: {
          items: lineSnapshot.map((l) => {
            const discount = Math.min(Math.max(0, l.lineDiscount), l.effectiveUnitPrice * l.quantity);
            return {
              productId: l.product.id,
              quantity: l.quantity,
              ...(l.variantChoices.length ? { variantChoices: l.variantChoices } : {}),
              ...(l.modifierChoices.length ? { modifierChoices: l.modifierChoices } : {}),
              ...(discount > 0 ? { discountAmount: discount } : {}),
              ...(l.note ? { notes: l.note } : {}),
            };
          }),
          paymentMethod: effectivePaymentMethod,
          ...(!voucherCoversAll && (paymentMethod === "card" || paymentMethod === "split") && cardType
            ? { cardType }
            : {}),
          ...(!voucherCoversAll && paymentMethod === "split" ? { splitCardAmount, splitCashAmount } : {}),
          ...(customerId ? { customerId } : {}),
          ...(discountType && discountValue > 0 ? { discountType, discountAmount } : {}),
          ...(loyaltyPointsToRedeem > 0
            ? { loyaltyPointsToRedeem: Math.min(loyaltyPointsToRedeem, maxRedeemable) }
            : {}),
          ...(appliedVoucher ? { giftVoucherCode: appliedVoucher.code } : {}),
          ...(!voucherCoversAll && paymentMethod === "cash" && tenderedAmount > 0
            ? { cashTendered: tenderedAmount }
            : {}),
          ...(orderNote.trim() ? { notes: orderNote.trim() } : {}),
        },
      });
      const items: ReceiptItem[] = lineSnapshot.map((l) => {
        const discount = Math.min(Math.max(0, l.lineDiscount), l.effectiveUnitPrice * l.quantity);
        return {
          quantity: l.quantity,
          productName: l.product.name,
          unitPrice: l.effectiveUnitPrice,
          lineTotal: l.effectiveUnitPrice * l.quantity - discount,
          variantChoices: l.variantChoices.map((v) => ({ optionName: v.optionName })),
          modifierChoices: l.modifierChoices.map((m) => ({ optionName: m.optionName })),
          ...(l.note ? { notes: l.note } : {}),
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
        ...(discountValue > 0 ? { discountValue } : {}),
        paymentMethod: voucherCoversAll ? "Gift Voucher" : paymentLabel,
        // Only attach tender to the receipt when NO voucher is applied, so the
        // builder's change calc (tendered - total) equals tendered - amountDue.
        // With a partial voucher, total > amountDue and the printed change would
        // be understated, so we omit it (on-screen change display still works).
        ...(!appliedVoucher && paymentMethod === "cash" && tenderedAmount > 0
          ? { cashTendered: tenderedAmount }
          : {}),
        ...(orderNote.trim() ? { notes: orderNote.trim() } : {}),
      };
      setReceipt(receiptOrder);
      cart.clear();
      reset();
      onComplete();
      if (printerReady && printerConfig.enabled && printerConfig.autoPrint) {
        void doPrint(receiptOrder);
      }
    } catch (e) {
      const { title, message } = friendlyCheckoutError(e);
      Alert.alert(title, message);
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
              const lineTotal = Math.max(0, l.effectiveUnitPrice * l.quantity - l.lineDiscount);
              const tierSavings = l.unitPrice - l.effectiveUnitPrice;
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
                      {tierSavings > 0.0001 ? (
                        <Text style={{ color: c.primary, fontSize: 12, fontFamily: fontFamily("medium"), marginTop: 2 }}>
                          {`Volume price ${formatMoney(l.effectiveUnitPrice)} ea · save ${formatMoney(tierSavings * l.quantity)}`}
                        </Text>
                      ) : null}
                    </View>
                    <Stepper value={l.quantity} onChange={(v) => cart.setQty(l.lineKey, v)} />
                  </View>
                  {l.note ? (
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontStyle: "italic" }}>
                      {`“${l.note}”`}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
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
                      <Pressable
                        onPress={() => setNoteFor(l.lineKey)}
                        hitSlop={6}
                        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                      >
                        <Feather name="edit-3" size={14} color={c.mutedForeground} />
                        <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
                          {l.note ? "Edit note" : "Add note"}
                        </Text>
                      </Pressable>
                    </View>
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

            {/* Order discount (manager-PIN gated) */}
            <Card style={{ gap: 10 }}>
              <Pressable
                onPress={() => setDiscountOpen(true)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name="percent" size={18} color={c.accent} />
                  <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>
                    {discountValue > 0
                      ? `Discount: ${
                          discountType === "percent" ? `${discountAmount}%` : formatMoney(discountAmount)
                        } (−${formatMoney(discountValue)})`
                      : "Add order discount"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={c.mutedForeground} />
              </Pressable>
              {discountValue > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  {discountAuthorizedBy ? (
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      Authorized by {discountAuthorizedBy}
                    </Text>
                  ) : (
                    <View />
                  )}
                  <Pressable
                    onPress={() => {
                      setDiscountType(null);
                      setDiscountAmount(0);
                      setDiscountAuthorizedBy(null);
                    }}
                  >
                    <Text style={{ color: c.destructive, fontSize: 13, fontFamily: fontFamily("medium") }}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>

            {/* Loyalty redemption (only with a customer who has points) */}
            {selectedCustomer && selectedCustomer.loyaltyPoints > 0 ? (
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Feather name="star" size={18} color={c.accent} />
                  <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>
                    Loyalty points
                  </Text>
                </View>
                <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                  {selectedCustomer.loyaltyPoints} available · 100 pts = $1
                </Text>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Points to redeem"
                      value={loyaltyPointsToRedeem ? String(loyaltyPointsToRedeem) : ""}
                      onChangeText={(t) => {
                        const n = Math.floor(parseFloat(t) || 0);
                        setLoyaltyPointsToRedeem(Math.max(0, Math.min(n, maxRedeemable)));
                      }}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </View>
                  <Button
                    label="Max"
                    variant="secondary"
                    onPress={() => setLoyaltyPointsToRedeem(maxRedeemable)}
                    style={{ marginBottom: 2 }}
                  />
                </View>
                {loyaltyPointsToRedeem > 0 ? (
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("medium") }}>
                    Redeeming {loyaltyPointsToRedeem} pts (−{formatMoney(loyaltyDiscount)})
                  </Text>
                ) : null}
              </Card>
            ) : null}

            {/* Gift voucher tender (online only) */}
            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name="gift" size={18} color={c.accent} />
                <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("medium") }}>
                  Gift voucher
                </Text>
              </View>
              {appliedVoucher ? (
                <View style={{ gap: 6 }}>
                  <Row label={`Voucher ${appliedVoucher.code}`} value={`−${formatMoney(voucherApplied)}`} />
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      Balance {formatMoney(appliedVoucher.balance)}
                    </Text>
                    <Pressable
                      onPress={() => {
                        setAppliedVoucher(null);
                        setVoucherCode("");
                      }}
                    >
                      <Text style={{ color: c.destructive, fontSize: 13, fontFamily: fontFamily("medium") }}>
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Voucher code"
                      value={voucherCode}
                      onChangeText={setVoucherCode}
                      placeholder="GV-XXXX"
                      autoCapitalize="characters"
                    />
                  </View>
                  <Button
                    label="Apply"
                    variant="secondary"
                    loading={voucherBusy}
                    onPress={async () => {
                      const code = voucherCode.trim();
                      if (!code) return;
                      setVoucherBusy(true);
                      try {
                        const v = await lookupGiftVoucher(code);
                        if (v.status !== "active") {
                          Alert.alert("Voucher unavailable", `This voucher is ${v.status}.`);
                          return;
                        }
                        if (v.balance <= 0) {
                          Alert.alert("No balance", "This voucher has no remaining balance.");
                          return;
                        }
                        setAppliedVoucher(v);
                      } catch (e) {
                        Alert.alert("Voucher not found", e instanceof Error ? e.message : "Could not find that voucher.");
                      } finally {
                        setVoucherBusy(false);
                      }
                    }}
                    style={{ marginBottom: 2 }}
                  />
                </View>
              )}
            </Card>

            {/* Payment */}
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium"), marginTop: 4 }}>
              PAYMENT METHOD
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {paymentMethods.map((m) => {
                const value = m.type === "custom" ? m.name : m.type;
                const active = paymentMethod === value;
                const label =
                  m.type === "card" && active
                    ? cardType === "debit"
                      ? "Debit Card"
                      : cardType === "credit"
                        ? "Credit Card"
                        : "Card"
                    : m.name;
                return <Chip key={m.id} label={label} active={active} onPress={() => selectPaymentMethod(m)} />;
              })}
            </View>

            {paymentMethod === "credit" && !customerId ? (
              <Text style={{ color: "#F59E0B", fontSize: 12, fontFamily: fontFamily("medium") }}>
                ⚠ Attach a customer above to record an on-account (credit) sale.
              </Text>
            ) : null}

            {paymentMethod === "split" ? (
              <Card style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Card amount"
                      value={splitCard}
                      onChangeText={setSplitCard}
                      placeholder="0"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Cash amount"
                      value={splitCash}
                      onChangeText={setSplitCash}
                      placeholder="0"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
                <Text
                  style={{
                    color: isSplitValid ? c.mutedForeground : "#F59E0B",
                    fontSize: 12,
                    fontFamily: fontFamily("medium"),
                  }}
                >
                  {isSplitValid
                    ? `Card + Cash = ${formatMoney(amountDue)} ✓`
                    : `Card + Cash must equal ${formatMoney(amountDue)}`}
                </Text>
              </Card>
            ) : null}

            {!voucherCoversAll && paymentMethod === "cash" ? (
              <Card style={{ gap: 10 }}>
                <Field
                  label="Amount tendered (optional)"
                  value={cashTendered}
                  onChangeText={setCashTendered}
                  placeholder={String(amountDue)}
                  keyboardType="decimal-pad"
                />
                {tenderedAmount > 0 ? (
                  <Text
                    style={{
                      color: tenderedAmount >= amountDue ? c.accent : "#F59E0B",
                      fontSize: 14,
                      fontFamily: fontFamily("semibold"),
                    }}
                  >
                    {tenderedAmount >= amountDue
                      ? `Change due: ${formatMoney(changeDue)}`
                      : `Short by ${formatMoney(amountDue - tenderedAmount)}`}
                  </Text>
                ) : null}
              </Card>
            ) : null}

            <Card style={{ gap: 10 }}>
              <Field
                label="Order note (optional)"
                value={orderNote}
                onChangeText={setOrderNote}
                placeholder="e.g. Leave at front desk"
              />
            </Card>
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
            {discountValue > 0 ? (
              <Row label="Discount" value={`−${formatMoney(discountValue)}`} />
            ) : null}
            {loyaltyDiscount > 0 ? (
              <Row label={`Loyalty (${loyaltyPointsToRedeem} pts)`} value={`−${formatMoney(loyaltyDiscount)}`} />
            ) : null}
            <Row label={`Tax${taxMode === "inclusive" ? " (incl.)" : ""}`} value={formatMoney(tax)} />
            <Divider />
            <Row label="Total" value={formatMoney(total)} bold />
            {voucherApplied > 0 ? (
              <>
                <Row label={`Voucher ${appliedVoucher?.code ?? ""}`} value={`−${formatMoney(voucherApplied)}`} />
                <Row label="Amount due" value={formatMoney(amountDue)} bold />
              </>
            ) : null}
            <Button
              label={voucherCoversAll ? "Complete sale (paid by voucher)" : `Charge ${formatMoney(amountDue)}`}
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

      <LineNoteModal
        line={cart.lines.find((l) => l.lineKey === noteFor) ?? null}
        onClose={() => setNoteFor(null)}
        onSave={(note) => {
          if (noteFor) cart.setNote(noteFor, note);
          setNoteFor(null);
        }}
      />

      <OrderDiscountModal
        visible={discountOpen}
        subtotal={cart.subtotal}
        authenticate={async (pin) => {
          const staff = await authStaff.mutateAsync({
            data: { pin, requiredRoles: ["manager", "admin", "supervisor"] },
          });
          return staff?.name ?? null;
        }}
        onClose={() => setDiscountOpen(false)}
        onApply={(type, amount, authorizedBy) => {
          setDiscountType(type);
          setDiscountAmount(amount);
          setDiscountAuthorizedBy(authorizedBy);
          setDiscountOpen(false);
        }}
      />
    </View>
  );
}

function OrderDiscountModal({
  visible,
  subtotal,
  authenticate,
  onClose,
  onApply,
}: {
  visible: boolean;
  subtotal: number;
  authenticate: (pin: string) => Promise<string | null>;
  onClose: () => void;
  onApply: (type: "percent" | "fixed", amount: number, authorizedBy: string | null) => void;
}) {
  const c = useColors();
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setType("percent");
      setAmount("");
      setPin("");
      setBusy(false);
    }
  }, [visible]);

  const amt = parseFloat(amount) || 0;
  const preview =
    amt > 0 ? Math.min(type === "percent" ? subtotal * (amt / 100) : amt, subtotal) : 0;

  const apply = async () => {
    if (amt <= 0) {
      Alert.alert("Enter a discount", "Enter a discount amount greater than zero.");
      return;
    }
    if (!pin.trim()) {
      Alert.alert("Manager PIN required", "Enter a manager PIN to authorize this discount.");
      return;
    }
    setBusy(true);
    try {
      const name = await authenticate(pin.trim());
      onApply(type, amt, name);
    } catch (e) {
      Alert.alert("Authorization failed", e instanceof Error ? e.message : "Invalid manager PIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderRadius: c.radius + 6, padding: 20, gap: 16 }}>
          <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>Order discount</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Chip label="Percent (%)" active={type === "percent"} onPress={() => setType("percent")} />
            <Chip label="Fixed ($)" active={type === "fixed"} onPress={() => setType("fixed")} />
          </View>
          <Field
            label={type === "percent" ? "Percentage" : "Amount"}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="decimal-pad"
            autoFocus
          />
          {preview > 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
              Discount: −{formatMoney(preview)}
            </Text>
          ) : null}
          <Field
            label="Manager PIN"
            value={pin}
            onChangeText={setPin}
            placeholder="••••"
            keyboardType="number-pad"
            secureTextEntry
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Apply" icon="check" onPress={apply} loading={busy} style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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

function LineNoteModal({
  line,
  onClose,
  onSave,
}: {
  line: CartLine | null;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const c = useColors();
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(line?.note ?? "");
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
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>Note prints on the receipt for this line.</Text>
          <Field
            label="Line note"
            value={value}
            onChangeText={setValue}
            placeholder="e.g. cut thin"
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Remove" variant="secondary" onPress={() => onSave("")} style={{ flex: 1 }} />
            <Button label="Save" icon="check" onPress={() => onSave(value)} style={{ flex: 1 }} />
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
