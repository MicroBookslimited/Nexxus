import { Feather } from "@expo/vector-icons";
import {
  useGetCustomerOrders,
  useListCustomers,
  type Customer,
} from "@workspace/api-client-react";
import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppHeader,
  Badge,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchBar,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatMoney, formatDate, formatNumber } from "@/lib/format";

export default function CustomersScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const { data: customers, isLoading, error, refetch } = useListCustomers();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = customers ?? [];
    if (!q) return list;
    return list.filter(
      (x) => x.name.toLowerCase().includes(q) || x.phone?.includes(q) || x.email?.toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Customers" subtitle={`${customers?.length ?? 0} total`} />

      <View style={{ padding: 16, paddingBottom: 8 }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, phone, email" />
      </View>

      {isLoading ? (
        <LoadingState label="Loading customers…" />
      ) : error ? (
        <ErrorState message="Could not load customers." onRetry={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(x) => String(x.id)}
          contentContainerStyle={{ paddingBottom: pad.bottom + 16, gap: 10 }}
          ListEmptyComponent={<EmptyState icon="users" title="No customers" />}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: 16 }}>
              <Card onPress={() => setSelected(item)} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: c.secondary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: c.accent, fontSize: 16, fontFamily: fontFamily("bold") }}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                    {item.name}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                    {item.phone || item.email || "No contact"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Badge label={`${formatNumber(item.loyaltyPoints)} pts`} tone="accent" />
                  <Text style={{ color: c.mutedForeground, fontSize: 11 }}>{item.orderCount} orders</Text>
                </View>
              </Card>
            </View>
          )}
        />
      )}

      <CustomerDetailModal customer={selected} onClose={() => setSelected(null)} />
    </View>
  );
}

function CustomerDetailModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!customer} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
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
          <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>Customer</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="x" size={26} color={c.foreground} />
          </Pressable>
        </View>
        {customer ? <CustomerDetailBody customer={customer} /> : null}
      </View>
    </Modal>
  );
}

function CustomerDetailBody({ customer }: { customer: Customer }) {
  const c = useColors();
  const pad = useScreenPadding();
  const { data: orders, isLoading } = useGetCustomerOrders(customer.id);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: pad.bottom + 16 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: c.secondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: c.accent, fontSize: 28, fontFamily: fontFamily("bold") }}>
            {customer.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: c.foreground, fontSize: 22, fontFamily: fontFamily("bold") }}>{customer.name}</Text>
        {customer.phone ? <Text style={{ color: c.mutedForeground }}>{customer.phone}</Text> : null}
        {customer.email ? <Text style={{ color: c.mutedForeground }}>{customer.email}</Text> : null}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <StatCard label="Loyalty" value={`${formatNumber(customer.loyaltyPoints)}`} icon="star" />
        <StatCard label="Spent" value={formatMoney(customer.totalSpent)} icon="dollar-sign" />
        <StatCard label="Orders" value={`${customer.orderCount}`} icon="shopping-bag" />
      </View>

      <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("semibold") }}>Recent orders</Text>
      {isLoading ? (
        <LoadingState />
      ) : !orders || orders.length === 0 ? (
        <EmptyState icon="inbox" title="No orders yet" />
      ) : (
        <Card style={{ gap: 0 }}>
          {orders.slice(0, 25).map((o, i) => (
            <View key={o.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 }}>
                <View>
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{o.orderNumber}</Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{formatDate(o.createdAt)}</Text>
                </View>
                <Text style={{ color: c.accent, fontFamily: fontFamily("semibold") }}>{formatMoney(o.total)}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ComponentProps<typeof Feather>["name"] }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 16 }}>
      <Feather name={icon} size={18} color={c.accent} />
      <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("bold") }}>
        {value}
      </Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{label}</Text>
    </Card>
  );
}
