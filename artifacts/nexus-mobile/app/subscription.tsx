import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Divider,
  ErrorState,
  LoadingState,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { formatMoney, formatDate } from "@/lib/format";
import { getToken, saasMe } from "@/lib/nexus-api";

function statusTone(status?: string): "success" | "warning" | "danger" | "neutral" {
  switch ((status ?? "").toLowerCase()) {
    case "active":
      return "success";
    case "trialing":
      return "warning";
    case "past_due":
    case "canceled":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>{value}</Text>
    </View>
  );
}

export default function SubscriptionScreen() {
  const c = useColors();
  const pad = useScreenPadding();
  const router = useRouter();
  const { signOut } = useAuth();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["saas-me"],
    queryFn: saasMe,
  });

  async function renew() {
    const token = await getToken();
    if (!token) {
      Alert.alert("Session expired", "Please sign in again.");
      signOut();
      return;
    }
    // Pass the token in the URL *fragment*, not a query param — fragments are
    // never sent to the server/proxy, so the token can't leak into request logs.
    const url = `https://${process.env.EXPO_PUBLIC_DOMAIN}/subscription#token=${encodeURIComponent(token)}`;
    try {
      await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: "done" });
    } catch (e) {
      Alert.alert("Could not open checkout", (e as Error).message);
    }
    // Re-pull status when the user returns from the web checkout.
    refetch();
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Subscription" subtitle="Plan & billing" onBack={() => router.back()} />
      {isLoading ? (
        <LoadingState label="Loading subscription…" />
      ) : error ? (
        <ErrorState message="Could not load subscription." onRetry={refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: pad.bottom + 32 }}>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold") }}>
                {data?.plan?.name ?? "No active plan"}
              </Text>
              <Badge label={data?.subscription?.status ?? "none"} tone={statusTone(data?.subscription?.status)} />
            </View>
            {data?.plan?.description ? (
              <Text style={{ color: c.mutedForeground, fontSize: 14, lineHeight: 20 }}>{data.plan.description}</Text>
            ) : null}
            <Divider />
            {data?.plan ? (
              <Row
                label="Price"
                value={`${formatMoney(
                  data.subscription?.billingCycle === "annual" ? data.plan.priceAnnual : data.plan.priceMonthly,
                )} / ${data.subscription?.billingCycle === "annual" ? "yr" : "mo"}`}
              />
            ) : null}
            {data?.subscription?.currentPeriodEnd ? (
              <Row label="Renews / expires" value={formatDate(data.subscription.currentPeriodEnd)} />
            ) : null}
            {data?.subscription?.trialEndsAt ? (
              <Row label="Trial ends" value={formatDate(data.subscription.trialEndsAt)} />
            ) : null}
          </Card>

          {data?.nextScheduledPayment ? (
            <Card style={{ gap: 6 }}>
              <Text style={{ color: "#4ADE80", fontSize: 15, fontFamily: fontFamily("semibold") }}>Renewal scheduled</Text>
              <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 19 }}>
                {data.nextScheduledPayment.planName ? `${data.nextScheduledPayment.planName} · ` : ""}
                {data.nextScheduledPayment.amount != null ? `${formatMoney(data.nextScheduledPayment.amount)} ` : ""}
                {data.nextScheduledPayment.scheduledFor
                  ? `on ${formatDate(data.nextScheduledPayment.scheduledFor)}`
                  : ""}
              </Text>
            </Card>
          ) : null}

          <Button label="Renew / manage subscription" icon="credit-card" onPress={renew} />
          <Text style={{ color: c.mutedForeground, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
            Opens a secure checkout in your browser. Your payment is handled by our web checkout (PayPal / card 3-D Secure).
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
