import { Feather } from "@expo/vector-icons";
import {
  useGetDashboardSummary,
  useGetReportSummary,
  useGetTopProducts,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import {
  AppHeader,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { StaffPinModal } from "@/components/StaffPinModal";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatMoney, formatNumber } from "@/lib/format";

/** Local YYYY-MM-DD (device timezone) for a date shifted by `deltaDays`. */
function isoDay(deltaDays = 0, base = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + deltaDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function monthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/;

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

function presetRange(key: RangeKey): { from: string; to: string } {
  switch (key) {
    case "today":
      return { from: isoDay(), to: isoDay() };
    case "yesterday":
      return { from: isoDay(-1), to: isoDay(-1) };
    case "7d":
      return { from: isoDay(-6), to: isoDay() };
    case "30d":
      return { from: isoDay(-29), to: isoDay() };
    case "month":
      return { from: monthStartISO(), to: isoDay() };
    case "custom":
      return { from: isoDay(-6), to: isoDay() };
  }
}

function rangeLabel(key: RangeKey, from: string, to: string): string {
  if (key === "today") return "today";
  if (key === "yesterday") return "yesterday";
  if (from === to) return from;
  return `${from} → ${to}`;
}

/** Sensitive business reports are for managers/admins only. Staff roles are
 * free-text, so match case-insensitively on "admin" / "manager". */
function canViewReports(role: string | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r.includes("admin") || r.includes("manager");
}

export default function ReportsScreen() {
  const c = useColors();
  const router = useRouter();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const { staff, setStaff } = useStaff();
  const [pinOpen, setPinOpen] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);

  const allowed = canViewReports(staff?.role);

  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [customFrom, setCustomFrom] = useState(isoDay(-6));
  const [customTo, setCustomTo] = useState(isoDay());

  const { from, to } = useMemo(() => {
    if (rangeKey !== "custom") return presetRange(rangeKey);
    // Fall back to a valid window if a custom date is mistyped or reversed.
    const f = VALID_DATE.test(customFrom.trim()) ? customFrom.trim() : isoDay(-6);
    const t = VALID_DATE.test(customTo.trim()) ? customTo.trim() : isoDay();
    return f <= t ? { from: f, to: t } : { from: t, to: f };
  }, [rangeKey, customFrom, customTo]);

  const dash = useGetDashboardSummary({
    query: { enabled: allowed, queryKey: ["dashboard", "summary"] },
  });
  const report = useGetReportSummary(
    { from, to },
    { query: { enabled: allowed, queryKey: ["reports", "summary", from, to] } },
  );
  const top = useGetTopProducts(
    { limit: 5 },
    { query: { enabled: allowed, queryKey: ["dashboard", "top-products", 5] } },
  );

  // ── Access gate: managers and admins only ─────────────────────────────
  if (!allowed) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Reports" subtitle="Restricted" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Card style={{ width: "100%", maxWidth: 420, alignItems: "center", gap: 14, padding: 24 }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: c.secondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="lock" size={28} color={c.accent} />
            </View>
            <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold"), textAlign: "center" }}>
              Managers only
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
                fontFamily: fontFamily("regular"),
              }}
            >
              {staff
                ? `${staff.name}, business reports contain sensitive financial data. Ask a manager or admin to sign in to view them.`
                : "Business reports contain sensitive financial data. Sign in as a manager or admin to view them."}
            </Text>
            {denied ? (
              <Text style={{ color: c.destructive, fontSize: 13, fontFamily: fontFamily("medium"), textAlign: "center" }}>
                {denied}
              </Text>
            ) : null}
            <Button
              label="Manager / Admin PIN"
              icon="unlock"
              onPress={() => {
                setDenied(null);
                setPinOpen(true);
              }}
              style={{ alignSelf: "stretch" }}
            />
          </Card>
        </View>
        <StaffPinModal
          visible={pinOpen}
          title="Manager Access"
          subtitle="Enter a manager or admin PIN to view reports."
          onSuccess={(s) => {
            setPinOpen(false);
            if (!canViewReports(s.role)) {
              setDenied(`${s.name} is not a manager or admin.`);
              return;
            }
            // The verified manager becomes the active cashier, consistent with
            // staff switching everywhere else in the app.
            setStaff({ id: s.id, name: s.name, role: s.role });
          }}
          onClose={() => setPinOpen(false)}
        />
      </View>
    );
  }

  const loading = dash.isLoading || report.isLoading;
  const refreshing = dash.isFetching || report.isFetching || top.isFetching;

  const onRefresh = () => {
    dash.refetch();
    report.refetch();
    top.refetch();
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Reports" subtitle="Business overview" />
        <LoadingState label="Crunching numbers…" />
      </View>
    );
  }

  if (dash.error && report.error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AppHeader title="Reports" />
        <ErrorState message="Could not load reports." onRetry={onRefresh} />
      </View>
    );
  }

  const d = dash.data;
  const r = report.data;
  const label = rangeLabel(rangeKey, from, to);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Reports" subtitle="Business overview" />
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          gap: 16,
          paddingBottom: pad.bottom + 16,
          width: "100%",
          maxWidth: lay.contentMaxWidth,
          alignSelf: "center",
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Today hero */}
        <Card style={{ gap: 4 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
            TODAY'S SALES
          </Text>
          <Text style={{ color: c.accent, fontSize: 34, fontFamily: fontFamily("bold") }}>
            {formatMoney(d?.todaySales)}
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
            {d?.todayOrders ?? 0} orders · avg {formatMoney(d?.avgOrderValue)}
          </Text>
        </Card>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <Metric icon="calendar" label="This week" value={formatMoney(d?.weekSales)} sub={`${d?.weekOrders ?? 0} orders`} />
          <Metric icon="box" label="Products" value={formatNumber(d?.totalProducts)} sub="active" />
        </View>

        {/* End of Day report — print / email a shift report like the web app */}
        <Card onPress={() => router.push("/eod-report")} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: c.secondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="printer" size={20} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
              End of Day Report
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
              Print or email a shift report
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={c.mutedForeground} />
        </Card>

        {/* Date filter */}
        <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>Sales report</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PRESETS.map((p) => {
            const active = rangeKey === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setRangeKey(p.key)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? c.primary : c.card,
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
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {rangeKey === "custom" ? (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="From (YYYY-MM-DD)" value={customFrom} onChangeText={setCustomFrom} placeholder="2026-07-01" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="To (YYYY-MM-DD)" value={customTo} onChangeText={setCustomTo} placeholder={isoDay()} />
              </View>
            </View>
            {!VALID_DATE.test(customFrom.trim()) || !VALID_DATE.test(customTo.trim()) ? (
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("regular") }}>
                Enter dates as YYYY-MM-DD. Invalid dates fall back to the last 7 days.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* Report summary for the selected range */}
        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("semibold"), textTransform: "uppercase", letterSpacing: 0.6 }}>
            {label}
          </Text>
          <Stat label="Revenue" value={formatMoney(r?.revenue)} />
          <Divider />
          <Stat label="Orders" value={formatNumber(r?.orders)} />
          <Divider />
          <Stat label="Avg order value" value={formatMoney(r?.avgOrderValue)} />
          <Divider />
          <Stat label="New customers" value={formatNumber(r?.newCustomers)} />
          <Divider />
          <Stat label="Voided orders" value={formatNumber(r?.voidedOrders)} />
          {r?.topProduct ? (
            <>
              <Divider />
              <Stat label="Top product" value={r.topProduct} />
            </>
          ) : null}
        </Card>

        {/* Top products */}
        <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>Top products (all time)</Text>
        {!top.data || top.data.length === 0 ? (
          <EmptyState icon="bar-chart-2" title="No sales data yet" />
        ) : (
          <Card style={{ gap: 0 }}>
            {top.data.map((p, i) => (
              <View key={p.productId}>
                {i > 0 ? <Divider /> : null}
                <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: c.secondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: c.accent, fontFamily: fontFamily("bold"), fontSize: 13 }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>
                      {p.productName}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{p.unitsSold} sold</Text>
                  </View>
                  <Text style={{ color: c.accent, fontFamily: fontFamily("semibold") }}>
                    {formatMoney(p.totalRevenue)}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  sub: string;
}) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, gap: 6 }}>
      <Feather name={icon} size={18} color={c.accent} />
      <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>{value}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{sub}</Text>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>{value}</Text>
    </View>
  );
}
