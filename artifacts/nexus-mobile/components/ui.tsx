import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useGetSettings } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === "web" ? Math.max(insets.top, 12) : insets.top;
  const bottom =
    Platform.OS === "web" ? 100 : insets.bottom + 64;
  return { top, bottom };
}

export function fontFamily(weight: "regular" | "medium" | "semibold" | "bold") {
  switch (weight) {
    case "bold":
      return "Inter_700Bold";
    case "semibold":
      return "Inter_600SemiBold";
    case "medium":
      return "Inter_500Medium";
    default:
      return "Inter_400Regular";
  }
}

/* ───────────── Screen ───────────── */

export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ flex: 1, backgroundColor: c.background }, style]}>{children}</View>;
}

/* ───────────── Header ───────────── */

export function AppHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const c = useColors();
  const { top } = useScreenPadding();
  const { data: settings } = useGetSettings();
  const businessName = settings?.business_name;

  return (
    <View
      style={{
        paddingTop: top + 3,
        paddingBottom: 5,
        paddingHorizontal: 12,
        backgroundColor: c.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      {/* Left: logo or back button */}
      <View style={{ width: 72, alignItems: "flex-start", justifyContent: "center" }}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={{ padding: 4 }}>
            <Feather name="chevron-left" size={24} color={c.foreground} />
          </Pressable>
        ) : (
          <View style={{ width: 68, height: 20, overflow: "hidden" }}>
            <Image
              source={require("../assets/nexxus-logo.png")}
              style={{ width: 68, height: 20, resizeMode: "contain" }}
            />
          </View>
        )}
      </View>

      {/* Center: NEXXUS POS · Business Name (+ per-screen title below) */}
      <View style={{ flex: 1, alignItems: "center" }}>
        <Text
          numberOfLines={1}
          style={{ color: c.foreground, fontSize: 13, fontFamily: fontFamily("bold"), letterSpacing: 0.3 }}
        >
          NEXXUS POS{businessName ? `  ·  ${businessName}` : ""}
        </Text>
        {title ? (
          <Text
            numberOfLines={1}
            style={{ color: c.mutedForeground, fontSize: 11, fontFamily: fontFamily("regular") }}
          >
            {title}{subtitle ? `  ·  ${subtitle}` : ""}
          </Text>
        ) : null}
      </View>

      {/* Right: caller-supplied actions */}
      <View style={{ width: 72, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}

/* ───────────── Card ───────────── */

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.card,
    borderRadius: c.radius + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: 14,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [base, style, pressed && { opacity: 0.7 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

/* ───────────── Buttons ───────────── */

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  icon?: FeatherName;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg =
    variant === "primary"
      ? c.primary
      : variant === "destructive"
        ? c.destructive
        : variant === "secondary"
          ? c.secondary
          : "transparent";
  const fg =
    variant === "primary" || variant === "destructive"
      ? "#FFFFFF"
      : variant === "secondary"
        ? c.secondaryForeground
        : c.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={() => {
        if (isDisabled) return;
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: c.radius + 2,
          paddingVertical: 14,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderWidth: variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: c.border,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontFamily: fontFamily("semibold") }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 20,
  bg,
}: {
  icon: FeatherName;
  onPress: () => void;
  color?: string;
  size?: number;
  bg?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg ?? c.secondary,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Feather name={icon} size={size} color={color ?? c.foreground} />
    </Pressable>
  );
}

/* ───────────── Badge ───────────── */

export function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const c = useColors();
  const map = {
    neutral: { bg: c.secondary, fg: c.secondaryForeground },
    success: { bg: "rgba(34,197,94,0.16)", fg: "#4ADE80" },
    warning: { bg: "rgba(245,158,11,0.16)", fg: "#FBBF24" },
    danger: { bg: "rgba(239,68,68,0.16)", fg: "#F87171" },
    accent: { bg: "rgba(34,211,238,0.16)", fg: c.accent },
  } as const;
  const t = map[tone];
  return (
    <View
      style={{
        backgroundColor: t.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: t.fg, fontSize: 12, fontFamily: fontFamily("semibold") }}>{label}</Text>
    </View>
  );
}

/* ───────────── Input ───────────── */

export function Field(props: TextInputProps & { label?: string }) {
  const c = useColors();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={c.mutedForeground}
        style={[
          {
            backgroundColor: c.background,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            borderRadius: c.radius + 2,
            paddingHorizontal: 14,
            paddingVertical: Platform.OS === "ios" ? 14 : 11,
            color: c.foreground,
            fontSize: 16,
            fontFamily: fontFamily("regular"),
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  onSubmitEditing,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: c.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        borderRadius: c.radius + 2,
        paddingHorizontal: 12,
      }}
    >
      <Feather name="search" size={18} color={c.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmitEditing}
        placeholderTextColor={c.mutedForeground}
        returnKeyType="search"
        style={{
          flex: 1,
          paddingVertical: Platform.OS === "ios" ? 12 : 9,
          color: c.foreground,
          fontSize: 16,
          fontFamily: fontFamily("regular"),
        }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Feather name="x" size={18} color={c.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────── Chip ───────────── */

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? c.primary : c.card,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? c.primary : c.border,
      }}
    >
      <Text
        style={{
          color: active ? "#FFFFFF" : c.mutedForeground,
          fontSize: 14,
          fontFamily: fontFamily("medium"),
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ───────────── Stepper ───────────── */

export function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: c.secondary,
        borderRadius: 999,
        paddingHorizontal: 6,
        paddingVertical: 4,
      }}
    >
      <Pressable onPress={() => onChange(value - 1)} hitSlop={6}>
        <Feather name="minus-circle" size={26} color={c.accent} />
      </Pressable>
      <Text
        style={{
          color: c.foreground,
          fontSize: 16,
          fontFamily: fontFamily("semibold"),
          minWidth: 24,
          textAlign: "center",
        }}
      >
        {value}
      </Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={6}>
        <Feather name="plus-circle" size={26} color={c.accent} />
      </Pressable>
    </View>
  );
}

/* ───────────── State views ───────────── */

export function LoadingState({ label }: { label?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 }}>
      <ActivityIndicator size="large" color={c.primary} />
      {label ? (
        <Text style={{ color: c.mutedForeground, fontFamily: fontFamily("regular") }}>{label}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  subtitle,
}: {
  icon?: FeatherName;
  title: string;
  subtitle?: string;
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 10, padding: 40 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
        }}
      >
        <Feather name={icon} size={28} color={c.mutedForeground} />
      </View>
      <Text
        style={{
          color: c.foreground,
          fontSize: 17,
          fontFamily: fontFamily("semibold"),
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 14,
            fontFamily: fontFamily("regular"),
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: 12, padding: 40 }}>
      <Feather name="alert-triangle" size={32} color={c.destructive} />
      <Text
        style={{
          color: c.foreground,
          fontSize: 15,
          fontFamily: fontFamily("regular"),
          textAlign: "center",
        }}
      >
        {message}
      </Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh-cw" /> : null}
    </View>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}
