/**
 * Orders — mobile order list with Void, Refund, WhatsApp, and Reprint.
 *
 * Role gate mirrors the web:
 *   - Managers / admins see all orders and can filter by staff.
 *   - Cashiers only see their own orders (staffId injected automatically).
 * Void and Refund require a manager/admin PIN (StaffPinModal).
 */
import { Feather } from "@expo/vector-icons";
import {
  useGetSettings,
  useListOrders,
  useListStaff,
  useRefundOrderItems,
  useUpdateOrderStatus,
} from "@workspace/api-client-react";
import * as Linking from "expo-linking";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  LoadingState,
  SearchBar,
  Stepper,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { StaffPinModal } from "@/components/StaffPinModal";
import { usePrinter } from "@/context/PrinterContext";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { printReceipt, buildReceiptText, type ReceiptOrder, type ReceiptSettings } from "@/lib/escpos";
import { formatMoney, formatDate } from "@/lib/format";

// ─── helpers ────────────────────────────────────────────────────────────────

function isoDay(delta = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today",     label: "Today"     },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d",        label: "7 days"    },
  { key: "30d",       label: "30 days"   },
  { key: "month",     label: "Month"     },
];
function rangeFromTo(key: RangeKey): { from: string; to: string } {
  switch (key) {
    case "today":     return { from: isoDay(),   to: isoDay()   };
    case "yesterday": return { from: isoDay(-1), to: isoDay(-1) };
    case "7d":        return { from: isoDay(-6), to: isoDay()   };
    case "30d":       return { from: isoDay(-29),to: isoDay()   };
    case "month":     return { from: monthStart(),to: isoDay()  };
  }
}

const STATUSES = ["all","completed","voided","refunded","pending"] as const;
type StatusKey = (typeof STATUSES)[number];
const STATUS_LABEL: Record<StatusKey, string> = {
  all: "All", completed: "Completed", voided: "Voided",
  refunded: "Refunded", pending: "Pending",
};
const STATUS_COLOR: Record<string, string> = {
  completed: "#22c55e",
  voided:    "#ef4444",
  refunded:  "#f59e0b",
  pending:   "#3b82f6",
};

function isManagerOrAdmin(role: string | undefined) {
  const r = (role ?? "").toLowerCase();
  return r.includes("admin") || r.includes("manager");
}

/** Build the WhatsApp wa.me URL with a plain-text receipt body. */
function whatsappUrl(phone: string, order: ReceiptOrder, settings: ReceiptSettings): string {
  const biz   = (settings.business_name ?? "NEXXUS POS").replace(/\s*\r?\n\s*/g, " ");
  const cur   = settings.base_currency ?? "JMD";
  const footer = settings.receipt_footer ?? "Thank you for your business!";
  const fmt   = (n: number) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(Math.abs(n)); }
    catch { return `${cur} ${Math.abs(n).toFixed(2)}`; }
  };
  const fmtN  = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date  = new Date(order.createdAt).toLocaleString("en-JM", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const num   = String(order.orderNumber);
  const last3 = num.replace(/\D/g, "").slice(-3).padStart(3, "0");

  const lines: string[] = [
    `🧾 *${biz}*`,
    `Order #: ${num}  |  Pickup: *${last3}*`,
    `📅 ${date}`,
    ...(order.staffName ? [`🧑 Cashier: ${order.staffName}`] : []),
    `─────────────────────`,
    ...order.items.map((it) => {
      const unit = it.unitPrice ?? (it.quantity > 0 ? it.lineTotal / it.quantity : it.lineTotal);
      return `${it.quantity}× ${it.productName}  ${fmtN(it.lineTotal)}`;
    }),
    `─────────────────────`,
    `Subtotal: ${fmtN(order.subtotal)}`,
    ...(order.tax > 0 ? [`Tax: ${fmtN(order.tax)}`] : []),
    ...(order.discountValue ? [`Discount: -${fmtN(order.discountValue)}`] : []),
    `*Total: ${fmt(order.total)}*`,
    ...(order.paymentMethod ? [`Paid via: ${order.paymentMethod}`] : []),
    `─────────────────────`,
    footer,
  ];
  const text = lines.join("\n");
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ─── main component ──────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const c       = useColors();
  const pad     = useScreenPadding();
  const lay     = useResponsive();
  const insets  = useSafeAreaInsets();
  const qc      = useQueryClient();
  const { staff } = useStaff();
  const { config: printerConfig } = usePrinter();

  const isMgr   = isManagerOrAdmin(staff?.role);

  // ── filters ──────────────────────────────────────────────────────────────
  const [range,  setRange]  = useState<RangeKey>("today");
  const [status, setStatus] = useState<StatusKey>("all");
  const [search, setSearch] = useState("");

  const { from, to } = rangeFromTo(range);
  const listParams: Record<string, unknown> = { limit: 200, from, to };
  if (status !== "all") listParams.status = status;
  if (!isMgr && staff?.id) listParams.staffId = staff.id;

  const ordersQ  = useListOrders(listParams, {
    query: { queryKey: ["orders", "list", from, to, status, isMgr ? "all" : staff?.id] },
  });
  const settingsQ = useGetSettings();
  const staffQ   = useListStaff({ query: { enabled: isMgr, queryKey: ["staff", "list"] } });
  const settings  = settingsQ.data ?? {};

  const orders = useMemo(() => {
    const list = ordersQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q),
    );
  }, [ordersQ.data, search]);

  // ── expanded row ──────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<number | null>(null);

  // ── manager PIN gate ──────────────────────────────────────────────────────
  const [pinOpen, setPinOpen]           = useState(false);
  const [pinTarget, setPinTarget]       = useState<{
    action: "void" | "refund";
    orderId: number;
  } | null>(null);

  function requestAction(action: "void" | "refund", orderId: number) {
    setPinTarget({ action, orderId });
    setPinOpen(true);
  }

  // ── void ──────────────────────────────────────────────────────────────────
  const [voidOpen, setVoidOpen]         = useState(false);
  const [voidId,   setVoidId]           = useState<number | null>(null);
  const [voidReason, setVoidReason]     = useState("");
  const updateStatus = useUpdateOrderStatus();

  function confirmVoid() {
    if (!voidId || !voidReason.trim()) return;
    updateStatus.mutate(
      { id: voidId, data: { status: "voided", voidReason } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["orders"] });
          setVoidOpen(false);
          setVoidId(null);
          setVoidReason("");
        },
        onError: (err: unknown) => {
          Alert.alert("Error", err instanceof Error ? err.message : "Could not void order.");
        },
      },
    );
  }

  // ── refund ────────────────────────────────────────────────────────────────
  const [refundOpen, setRefundOpen]       = useState(false);
  const [refundId,   setRefundId]         = useState<number | null>(null);
  const [refundReason, setRefundReason]   = useState("");
  const [refundQtys, setRefundQtys]       = useState<Record<number, number>>({});
  const [toVoucher, setToVoucher]         = useState(false);
  const refundMutation = useRefundOrderItems();

  const refundOrder = orders.find((o) => o.id === refundId) ?? null;

  function confirmRefund() {
    if (!refundId || !refundReason.trim()) return;
    const lines = Object.entries(refundQtys)
      .map(([id, qty]) => ({ orderItemId: Number(id), quantity: qty }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      Alert.alert("Select items", "Choose at least one item to refund.");
      return;
    }
    refundMutation.mutate(
      {
        id: refundId,
        data: {
          items: lines,
          reason: refundReason,
          refundToVoucher: toVoucher,
          ...(staff?.id ? { staffId: staff.id } : {}),
        },
      },
      {
        onSuccess: (res) => {
          qc.invalidateQueries({ queryKey: ["orders"] });
          const voucher = res.refundVoucher;
          const msg = voucher
            ? `Voucher ${voucher.code} issued for ${formatMoney(voucher.balance)}.`
            : "Refund processed. Stock restored.";
          Alert.alert("Refund complete", msg);
          setRefundOpen(false);
          setRefundId(null);
          setRefundReason("");
          setRefundQtys({});
          setToVoucher(false);
        },
        onError: (err: unknown) => {
          Alert.alert("Refund failed", err instanceof Error ? err.message : "Could not process refund.");
        },
      },
    );
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  const [waOpen, setWaOpen]   = useState(false);
  const [waOrder, setWaOrder] = useState<(typeof orders)[0] | null>(null);
  const [waPhone, setWaPhone] = useState("");

  function openWhatsApp(order: (typeof orders)[0]) {
    setWaOrder(order);
    setWaPhone("");
    setWaOpen(true);
  }

  function sendWhatsApp() {
    if (!waOrder) return;
    const phoneInput = waPhone.trim();
    if (!phoneInput) { Alert.alert("Phone required", "Enter a WhatsApp number."); return; }
    const ro: ReceiptOrder = {
      orderNumber: waOrder.orderNumber,
      createdAt:   waOrder.createdAt,
      staffName:   waOrder.staffName ?? undefined,
      items:       waOrder.items.map((i) => ({
        quantity: i.quantity, productName: i.productName,
        lineTotal: i.lineTotal, unitPrice: i.unitPrice ?? undefined,
      })),
      subtotal:      waOrder.subtotal,
      tax:           waOrder.tax,
      total:         waOrder.total,
      discountValue: waOrder.discountValue ?? undefined,
      paymentMethod: waOrder.paymentMethod ?? undefined,
    };
    const url = whatsappUrl(phoneInput, ro, settings);
    Linking.openURL(url).catch(() =>
      Alert.alert("Cannot open WhatsApp", "Make sure WhatsApp is installed.")
    );
    setWaOpen(false);
  }

  // ── reprint ───────────────────────────────────────────────────────────────
  async function reprInt(order: (typeof orders)[0]) {
    if (!printerConfig?.enabled) {
      Alert.alert("Printer off", "Enable the printer in Printer Settings first.");
      return;
    }
    const ro: ReceiptOrder = {
      orderNumber:   order.orderNumber,
      createdAt:     order.createdAt,
      staffName:     order.staffName ?? undefined,
      items:         order.items.map((i) => ({
        quantity: i.quantity, productName: i.productName,
        lineTotal: i.lineTotal, unitPrice: i.unitPrice ?? undefined,
      })),
      subtotal:      order.subtotal,
      tax:           order.tax,
      total:         order.total,
      discountValue: order.discountValue ?? undefined,
      paymentMethod: order.paymentMethod ?? undefined,
      cashTendered:  order.cashTendered ?? undefined,
    };
    try {
      await printReceipt(printerConfig, ro, settings);
    } catch (err) {
      Alert.alert("Print failed", err instanceof Error ? err.message : "Could not print.");
    }
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader
        title="Orders"
        subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"}`}
      />

      {/* Filters */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search order # or customer" />

        {/* Date range chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {RANGES.map((r) => (
            <Chip
              key={r.key}
              label={r.label}
              active={range === r.key}
              onPress={() => setRange(r.key)}
            />
          ))}
        </ScrollView>

        {/* Status chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              active={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </ScrollView>
      </View>

      {ordersQ.isLoading ? (
        <LoadingState label="Loading orders…" />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{
            padding: 16,
            gap: 12,
            paddingBottom: pad.bottom + 16,
            maxWidth: lay.contentMaxWidth,
            alignSelf: "center",
            width: "100%",
          }}
          refreshControl={
            <RefreshControl
              refreshing={ordersQ.isFetching}
              onRefresh={() => ordersQ.refetch()}
              tintColor={c.accent}
            />
          }
          ListEmptyComponent={
            <EmptyState icon="shopping-bag" title="No orders" subtitle="No orders match your filters." />
          }
          renderItem={({ item: order }) => {
            const isOpen = expanded === order.id;
            const statusColor = STATUS_COLOR[order.status] ?? c.mutedForeground;
            return (
              <Card style={{ gap: 0, padding: 0, overflow: "hidden" }}>
                {/* Header row — tap to expand */}
                <Pressable
                  onPress={() => setExpanded(isOpen ? null : order.id)}
                  style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 15 }}>
                        {order.orderNumber}
                      </Text>
                      <StatusBadge status={order.status} />
                    </View>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {formatDate(order.createdAt)}
                      {order.staffName && isMgr ? `  ·  ${order.staffName}` : ""}
                    </Text>
                  </View>
                  <Text style={{ color: c.accent, fontFamily: fontFamily("bold"), fontSize: 16 }}>
                    {formatMoney(order.total)}
                  </Text>
                  <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={c.mutedForeground} />
                </Pressable>

                {/* Expanded detail */}
                {isOpen ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: c.border }}>
                    {/* Line items */}
                    <View style={{ padding: 14, gap: 6 }}>
                      {order.items.map((item, idx) => (
                        <View key={item.id ?? idx} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ color: c.mutedForeground, flex: 1, fontSize: 13 }}>
                            {item.quantity}× {item.productName}
                            {(item.refundedQuantity ?? 0) > 0
                              ? ` (${item.refundedQuantity} refunded)`
                              : ""}
                          </Text>
                          <Text style={{ color: c.foreground, fontSize: 13, fontFamily: fontFamily("medium") }}>
                            {formatMoney(item.lineTotal)}
                          </Text>
                        </View>
                      ))}
                      <Divider />
                      {(order.discountValue ?? 0) > 0 && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Discount</Text>
                          <Text style={{ color: c.destructive, fontSize: 12 }}>-{formatMoney(order.discountValue!)}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Tax</Text>
                        <Text style={{ color: c.foreground, fontSize: 12 }}>{formatMoney(order.tax)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold") }}>Total</Text>
                        <Text style={{ color: c.accent, fontFamily: fontFamily("bold") }}>{formatMoney(order.total)}</Text>
                      </View>
                      {order.paymentMethod ? (
                        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                          Paid: {order.paymentMethod}
                        </Text>
                      ) : null}
                    </View>

                    {/* Actions */}
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                        padding: 12,
                        borderTopWidth: 1,
                        borderTopColor: c.border,
                      }}
                    >
                      {/* WhatsApp */}
                      <ActionBtn
                        icon="message-circle"
                        label="WhatsApp"
                        color="#25D366"
                        onPress={() => openWhatsApp(order)}
                      />

                      {/* Reprint */}
                      <ActionBtn
                        icon="printer"
                        label="Reprint"
                        color={c.accent}
                        onPress={() => reprInt(order)}
                      />

                      {/* Void — only on completed/pending orders */}
                      {(order.status === "completed" || order.status === "pending") && (
                        <ActionBtn
                          icon="x-circle"
                          label="Void"
                          color={c.destructive}
                          onPress={() => requestAction("void", order.id)}
                        />
                      )}

                      {/* Refund — only on completed orders with unreturned items */}
                      {order.status === "completed" &&
                        order.items.some(
                          (i) => i.quantity - (i.refundedQuantity ?? 0) > 0,
                        ) && (
                          <ActionBtn
                            icon="rotate-ccw"
                            label="Refund"
                            color="#f59e0b"
                            onPress={() => requestAction("refund", order.id)}
                          />
                        )}
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}

      {/* ── Manager PIN modal ── */}
      <StaffPinModal
        visible={pinOpen}
        title="Manager Access"
        subtitle="Enter a manager or admin PIN to continue."
        onSuccess={(s) => {
          setPinOpen(false);
          if (!isManagerOrAdmin(s.role)) {
            Alert.alert("Access denied", `${s.name} is not a manager or admin.`);
            setPinTarget(null);
            return;
          }
          const target = pinTarget;
          setPinTarget(null);
          if (!target) return;
          if (target.action === "void") {
            setVoidId(target.orderId);
            setVoidReason("");
            setVoidOpen(true);
          } else {
            const order = ordersQ.data?.find((o) => o.id === target.orderId);
            if (!order) return;
            setRefundId(target.orderId);
            setRefundReason("");
            // Initialize each refundable item to its max remaining qty
            const init: Record<number, number> = {};
            order.items.forEach((i) => {
              const remaining = i.quantity - (i.refundedQuantity ?? 0);
              if (remaining > 0) init[i.id] = remaining;
            });
            setRefundQtys(init);
            setToVoucher(false);
            setRefundOpen(true);
          }
        }}
        onClose={() => {
          setPinOpen(false);
          setPinTarget(null);
        }}
      />

      {/* ── Void dialog ── */}
      <BottomModal visible={voidOpen} onClose={() => setVoidOpen(false)} title="Void Order">
        <Text style={{ color: c.mutedForeground, fontSize: 14, marginBottom: 12 }}>
          Voiding this order restores stock. This cannot be undone.
        </Text>
        <Field
          label="Reason (required)"
          value={voidReason}
          onChangeText={setVoidReason}
          placeholder="e.g. Customer cancelled"
        />
        <Button
          label={updateStatus.isPending ? "Voiding…" : "Confirm Void"}
          icon="x-circle"
          onPress={confirmVoid}
          disabled={!voidReason.trim() || updateStatus.isPending}
          style={{ marginTop: 12, backgroundColor: c.destructive }}
        />
      </BottomModal>

      {/* ── Refund dialog ── */}
      <BottomModal visible={refundOpen} onClose={() => setRefundOpen(false)} title="Refund Items">
        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 12 }}>
            Adjust quantities to refund. Items set to 0 are skipped.
          </Text>
          {refundOrder?.items
            .filter((i) => i.quantity - (i.refundedQuantity ?? 0) > 0)
            .map((item) => {
              const max = item.quantity - (item.refundedQuantity ?? 0);
              const qty = refundQtys[item.id] ?? max;
              return (
                <View key={item.id} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: c.foreground, flex: 1, fontFamily: fontFamily("medium"), fontSize: 14 }}>
                      {item.productName}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>max {max}</Text>
                  </View>
                  <Stepper
                    value={qty}
                    onChange={(v) =>
                      setRefundQtys((prev) => ({ ...prev, [item.id]: Math.max(0, Math.min(max, v)) }))
                    }
                  />
                </View>
              );
            })}
          <Field
            label="Reason (required)"
            value={refundReason}
            onChangeText={setRefundReason}
            placeholder="e.g. Damaged item"
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 12,
              padding: 12,
              backgroundColor: c.secondary,
              borderRadius: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.foreground, fontFamily: fontFamily("medium"), fontSize: 14 }}>
                Refund as store credit
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 12 }}>Issues a gift voucher instead of cash</Text>
            </View>
            <Switch
              value={toVoucher}
              onValueChange={setToVoucher}
              trackColor={{ true: c.primary, false: c.border }}
            />
          </View>
        </ScrollView>
        <Button
          label={refundMutation.isPending ? "Processing…" : "Confirm Refund"}
          icon="rotate-ccw"
          onPress={confirmRefund}
          disabled={!refundReason.trim() || refundMutation.isPending}
          style={{ marginTop: 12, backgroundColor: "#f59e0b" }}
        />
      </BottomModal>

      {/* ── WhatsApp dialog ── */}
      <BottomModal visible={waOpen} onClose={() => setWaOpen(false)} title="Send via WhatsApp">
        <Text style={{ color: c.mutedForeground, fontSize: 13, marginBottom: 12 }}>
          Enter the customer's WhatsApp number (with country code).
        </Text>
        <Field
          label="Phone number"
          value={waPhone}
          onChangeText={setWaPhone}
          placeholder="+18761234567"
          keyboardType="phone-pad"
        />
        <Button
          label="Open WhatsApp"
          icon="message-circle"
          onPress={sendWhatsApp}
          style={{ marginTop: 12, backgroundColor: "#25D366" }}
        />
      </BottomModal>
    </View>
  );
}

// ─── small helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = useColors();
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    completed: { bg: "rgba(34,197,94,0.16)", fg: "#4ADE80", label: "Completed" },
    voided:    { bg: "rgba(239,68,68,0.16)", fg: "#F87171", label: "Voided"    },
    refunded:  { bg: "rgba(245,158,11,0.16)",fg: "#FBBF24", label: "Refunded"  },
    pending:   { bg: "rgba(59,130,246,0.16)",fg: "#60A5FA", label: "Pending"   },
  };
  const t = map[status] ?? { bg: c.secondary, fg: c.mutedForeground, label: status };
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: t.fg, fontSize: 11, fontFamily: "Inter_500Medium" }}>{t.label}</Text>
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  color: string;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: `${color}22`,
        borderWidth: 1,
        borderColor: `${color}44`,
      }}
    >
      <Feather name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 13, fontFamily: "Inter_500Medium" }}>{label}</Text>
    </Pressable>
  );
}

function BottomModal({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const c      = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        onPress={onClose}
      />
      <View
        style={{
          backgroundColor: c.card,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: insets.bottom + 20,
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "90%",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 18 }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={22} color={c.mutedForeground} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}
