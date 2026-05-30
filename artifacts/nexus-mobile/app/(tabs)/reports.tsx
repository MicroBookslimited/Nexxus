import { Feather } from "@expo/vector-icons";
import {
  useGetDashboardSummary,
  useGetReportSummary,
  useGetTopProducts,
} from "@workspace/api-client-react";
import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import {
  AppHeader,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatMoney, formatNumber, todayISO } from "@/lib/format";

export default function ReportsScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const today = todayISO();

  const dash = useGetDashboardSummary();
  const report = useGetReportSummary({ from: today, to: today });
  const top = useGetTopProducts({ limit: 5 });

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

        {/* Report summary (today) */}
        <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>Today's report</Text>
        <Card style={{ gap: 10 }}>
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
        <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>Top products</Text>
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
