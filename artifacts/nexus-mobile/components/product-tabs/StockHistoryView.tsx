import { useGetProductStockHistory } from "@workspace/api-client-react";
import React from "react";
import { Text, View } from "react-native";

import { Card, EmptyState, ErrorState, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/format";

const TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  restock: "Restock",
  refund: "Refund",
  void: "Void",
  purchase_bill: "Purchase",
  adjustment: "Adjustment",
};

export function StockHistoryView({ productId }: { productId: number }) {
  const c = useColors();
  const { data, isLoading, error, refetch } = useGetProductStockHistory(productId, { limit: 200 });

  if (isLoading) return <LoadingState label="Loading history…" />;
  if (error) return <ErrorState message="Could not load stock history." onRetry={refetch} />;

  const movements = data?.movements ?? [];
  const totalSold = movements.filter((m) => m.type === "sale").reduce((s, m) => s + Math.abs(m.quantity), 0);
  const totalReceived = movements
    .filter((m) => m.type === "restock" || m.type === "purchase_bill")
    .reduce((s, m) => s + Math.abs(m.quantity), 0);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SummaryCard label="Current stock" value={String(data?.product.currentStock ?? 0)} />
        <SummaryCard label="Total sold" value={String(totalSold)} />
        <SummaryCard label="Received" value={String(totalReceived)} />
      </View>

      {movements.length === 0 ? (
        <EmptyState icon="clock" title="No stock movements yet" />
      ) : (
        <Card style={{ gap: 0, paddingVertical: 4 }}>
          {movements.map((m, i) => {
            const positive = m.quantity > 0;
            return (
              <View
                key={m.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: c.border,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium") }}>
                    {TYPE_LABELS[m.type] ?? m.type}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 1 }}>
                    {new Date(m.createdAt).toLocaleString()}
                  </Text>
                  {m.notes ? (
                    <Text style={{ color: c.mutedForeground, fontSize: 11, marginTop: 1 }} numberOfLines={2}>
                      {m.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: positive ? "#22C55E" : c.destructive,
                      fontSize: 15,
                      fontFamily: fontFamily("bold"),
                    }}
                  >
                    {positive ? "+" : ""}
                    {m.quantity}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Bal: {m.balanceAfter}</Text>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, alignItems: "center", gap: 2, paddingVertical: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: fontFamily("medium") }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>{value}</Text>
    </Card>
  );
}
