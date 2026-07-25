import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, Text, View, useColorScheme } from "react-native";

import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

const TABS: {
  name: string;
  title: string;
  feather: FeatherName;
  sf: string;
  sfSelected: string;
}[] = [
  { name: "index", title: "Sell", feather: "shopping-cart", sf: "cart", sfSelected: "cart.fill" },
  { name: "catalog", title: "Products", feather: "grid", sf: "square.grid.2x2", sfSelected: "square.grid.2x2.fill" },
  { name: "inventory", title: "Inventory", feather: "package", sf: "shippingbox", sfSelected: "shippingbox.fill" },
  { name: "purchases", title: "Purchases", feather: "truck", sf: "cart.badge.plus", sfSelected: "cart.badge.plus" },
  { name: "customers", title: "Customers", feather: "users", sf: "person.2", sfSelected: "person.2.fill" },
  { name: "orders", title: "Orders", feather: "list", sf: "list.bullet.rectangle", sfSelected: "list.bullet.rectangle.fill" },
  { name: "cash", title: "Cash", feather: "dollar-sign", sf: "dollarsign.circle", sfSelected: "dollarsign.circle.fill" },
  { name: "reports", title: "Reports", feather: "bar-chart-2", sf: "chart.bar", sfSelected: "chart.bar.fill" },
];

function NativeTabLayout() {
  return (
    <NativeTabs>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <Icon sf={{ default: t.sf as never, selected: t.sfSelected as never }} />
          <Label>{t.title}</Label>
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 68 } : { height: 78 }),
        },
        tabBarItemStyle: isWeb
          ? { paddingTop: 6, paddingBottom: 14 }
          : { paddingTop: 6, paddingBottom: 18 },
        tabBarBackground: () => (
          <>
            {isIOS ? (
              <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
            )}
            <View style={{ position: "absolute", bottom: 2, left: 0, right: 0, alignItems: "center" }}>
              <Text style={{ fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular", letterSpacing: 0.2 }}>
                Powered by MicroBooks
              </Text>
            </View>
          </>
        ),
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) =>
              isIOS ? (
                <SymbolView name={t.sf as never} tintColor={color} size={24} />
              ) : (
                <Feather name={t.feather} size={22} color={color} />
              ),
          }}
        />
      ))}
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
