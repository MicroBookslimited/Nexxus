import { Feather } from "@expo/vector-icons";
import { useGetSettings } from "@workspace/api-client-react";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Card, Divider, fontFamily } from "@/components/ui";
import { StaffPinModal } from "@/components/StaffPinModal";
import { useAuth } from "@/context/AuthContext";
import { usePrinter } from "@/context/PrinterContext";
import { useStaff } from "@/context/StaffContext";
import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

function SectionTitle({ label }: { label: string }) {
  const c = useColors();
  return (
    <Text
      style={{
        color: c.mutedForeground,
        fontSize: 12,
        fontFamily: fontFamily("semibold"),
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginLeft: 4,
        marginBottom: -6,
      }}
    >
      {label}
    </Text>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  destructive,
  badge,
}: {
  icon: FeatherName;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  badge?: { label: string; tone: "success" | "danger" | "warning" | "neutral" };
}) {
  const c = useColors();
  const color = destructive ? c.destructive : c.foreground;
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: c.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={icon} size={17} color={destructive ? c.destructive : c.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 15, fontFamily: fontFamily("medium") }} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text
            style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("regular"), marginTop: 1 }}
            numberOfLines={2}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
      {onPress ? <Feather name="chevron-right" size={18} color={c.mutedForeground} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {content}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tenant, subscription, signOut } = useAuth();
  const { staff, setStaff, clearStaff } = useStaff();
  const { config: printer, kitchen } = usePrinter();
  const { data: settings } = useGetSettings();
  const [staffPinOpen, setStaffPinOpen] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  const confirmStaffSignOut = () => {
    Alert.alert(
      "Sign out cashier",
      `Sign out ${staff?.name}? The register will lock until another staff member signs in.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => clearStaff() },
      ],
    );
  };

  const confirmBusinessLogout = () => {
    Alert.alert("Log out", "Sign out of this business account? The cashier session is also cleared.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: () => {
          clearStaff();
          void signOut();
        },
      },
    ]);
  };

  const printerSummary = printer.enabled
    ? printer.transport === "network"
      ? `Network · ${printer.host || "no IP set"}`
      : printer.transport === "bluetooth"
        ? `Bluetooth · ${printer.deviceName || "no printer selected"}`
        : "USB"
    : "Disabled";
  const kitchenSummary = kitchen.enabled
    ? kitchen.transport === "network"
      ? `Network · ${kitchen.host || "no IP set"}`
      : `Bluetooth · ${kitchen.deviceName || "no printer selected"}`
    : "Disabled";

  const subStatus = subscription?.status;

  return (
    <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={24} color={c.foreground} />
        </Pressable>
        <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 32 }}>
        <SectionTitle label="Cashier" />
        <Card style={{ paddingVertical: 2 }}>
          <Row
            icon="user"
            label={staff ? staff.name : "No cashier signed in"}
            value={staff ? staff.role : "The register is locked until a staff member signs in"}
            badge={staff ? { label: "Signed in", tone: "success" } : { label: "Locked", tone: "danger" }}
          />
          <Divider />
          <Row
            icon="users"
            label={staff ? "Switch staff" : "Sign in staff"}
            value="Authenticate with a staff PIN"
            onPress={() => setStaffPinOpen(true)}
          />
          {staff ? (
            <>
              <Divider />
              <Row icon="log-out" label="Sign out cashier" destructive onPress={confirmStaffSignOut} />
            </>
          ) : null}
        </Card>

        <SectionTitle label="Register" />
        <Card style={{ paddingVertical: 2 }}>
          <Row
            icon="dollar-sign"
            label="Cash shift"
            value="Open, review, or close the current shift"
            onPress={() => router.navigate("/(tabs)/cash")}
          />
          <Divider />
          <Row
            icon="shield"
            label="Register requirements"
            value="A signed-in cashier with their own open shift is required before sales can be made"
          />
        </Card>

        <SectionTitle label="Printing" />
        <Card style={{ paddingVertical: 2 }}>
          <Row
            icon="printer"
            label="Receipt printer"
            value={printerSummary}
            onPress={() => router.push("/printer-settings")}
          />
          <Divider />
          <Row
            icon="coffee"
            label="Kitchen printer"
            value={kitchenSummary}
            onPress={() => router.push("/printer-settings")}
          />
        </Card>

        <SectionTitle label="Business" />
        <Card style={{ paddingVertical: 2 }}>
          <Row
            icon="briefcase"
            label={settings?.business_name || tenant?.businessName || "Business"}
            value={settings?.business_address || undefined}
          />
          <Divider />
          <Row
            icon="percent"
            label={settings?.tax_name || "Tax"}
            value={
              settings?.tax_rate
                ? `${settings.tax_rate}% · ${settings?.tax_mode === "inclusive" ? "included in prices" : "added at checkout"}`
                : "Not configured"
            }
          />
          <Divider />
          <Row icon="globe" label="Currency" value={settings?.base_currency || "Not set"} />
        </Card>

        <SectionTitle label="Account" />
        <Card style={{ paddingVertical: 2 }}>
          <Row
            icon="credit-card"
            label="Subscription"
            value={tenant?.email}
            badge={
              subStatus === "active"
                ? { label: "Active", tone: "success" }
                : subStatus
                  ? { label: subStatus, tone: "warning" }
                  : undefined
            }
            onPress={() => router.push("/subscription")}
          />
          <Divider />
          <Row icon="log-out" label="Log out of business account" destructive onPress={confirmBusinessLogout} />
        </Card>

        <SectionTitle label="About" />
        <Card style={{ paddingVertical: 2 }}>
          <Row icon="smartphone" label="NEXXUS POS Mobile" value={`Version ${appVersion}`} />
        </Card>
      </ScrollView>

      <StaffPinModal
        visible={staffPinOpen}
        title={staff ? "Switch Staff" : "Sign In Staff"}
        subtitle="Enter a staff PIN to ring up sales under their name."
        onSuccess={(s) => {
          setStaff({ id: s.id, name: s.name, role: s.role });
          setStaffPinOpen(false);
        }}
        onClose={() => setStaffPinOpen(false)}
      />
    </View>
  );
}
