import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { useAuthenticateStaff } from "@workspace/api-client-react";

import { fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

export interface AuthedStaff {
  id: number;
  name: string;
  role: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
const MIN_PIN = 4;
const MAX_PIN = 8;

/**
 * A numeric PIN pad modal that authenticates a staff member by PIN (mirrors the
 * web PinPad's PIN-only flow). Card-swipe override is intentionally omitted —
 * mobile hardware has no global USB-HID keyboard wedge to capture swipes.
 */
export function StaffPinModal({
  visible,
  title = "Enter Staff PIN",
  subtitle,
  onSuccess,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onSuccess: (staff: AuthedStaff) => void;
  onClose: () => void;
}) {
  const c = useColors();
  const authStaff = useAuthenticateStaff();
  const [digits, setDigits] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setDigits([]);
    setErrorMsg(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submitPin = async (pin: string) => {
    if (authStaff.isPending) return;
    try {
      const res = await authStaff.mutateAsync({ data: { pin } });
      onSuccess({ id: res.id, name: res.name, role: res.role });
      reset();
    } catch (e) {
      setErrorMsg(e instanceof Error && e.message ? e.message : "Invalid PIN");
      setDigits([]);
    }
  };

  const handleKey = (key: string) => {
    if (authStaff.isPending) return;
    setErrorMsg(null);
    if (key === "del") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === "") return;
    if (digits.length >= MAX_PIN) return;
    const next = [...digits, key];
    setDigits(next);
    // Auto-submit only when the max length is reached; shorter PINs use Enter.
    if (next.length === MAX_PIN) void submitPin(next.join(""));
  };

  const canSubmit = digits.length >= MIN_PIN && !authStaff.isPending;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: "100%",
            maxWidth: 360,
            backgroundColor: c.card,
            borderRadius: c.radius * 1.5,
            borderWidth: 1,
            borderColor: c.border,
            padding: 24,
            alignItems: "center",
            gap: 16,
          }}
        >
          <Text style={{ color: c.foreground, fontSize: 20, fontFamily: fontFamily("bold") }}>
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 13,
                fontFamily: fontFamily("regular"),
                textAlign: "center",
                marginTop: -8,
              }}
            >
              {subtitle}
            </Text>
          ) : null}

          {/* Dot indicators */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {Array.from({ length: MAX_PIN }).map((_, i) => (
              <View
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor:
                    i < digits.length
                      ? c.primary
                      : i < MIN_PIN
                        ? c.mutedForeground
                        : c.border,
                  backgroundColor: i < digits.length ? c.primary : "transparent",
                }}
              />
            ))}
          </View>

          {errorMsg ? (
            <Text
              style={{
                color: c.destructive,
                fontSize: 13,
                fontFamily: fontFamily("medium"),
                textAlign: "center",
                marginTop: -8,
              }}
            >
              {errorMsg}
            </Text>
          ) : null}

          {/* Numpad */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              width: 240,
              justifyContent: "space-between",
              rowGap: 12,
            }}
          >
            {KEYS.map((key, idx) => {
              if (key === "") return <View key={idx} style={{ width: 72, height: 64 }} />;
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleKey(key)}
                  disabled={authStaff.isPending}
                  style={({ pressed }) => ({
                    width: 72,
                    height: 64,
                    borderRadius: c.radius,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: key === "del" ? c.background : c.card,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.6 : authStaff.isPending ? 0.5 : 1,
                  })}
                >
                  {key === "del" ? (
                    <Feather name="delete" size={22} color={c.foreground} />
                  ) : (
                    <Text
                      style={{ color: c.foreground, fontSize: 24, fontFamily: fontFamily("bold") }}
                    >
                      {key}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Enter */}
          <Pressable
            onPress={() => void submitPin(digits.join(""))}
            disabled={!canSubmit}
            style={{
              width: "100%",
              height: 50,
              borderRadius: c.radius,
              backgroundColor: c.primary,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            <Feather name="check" size={20} color={c.primaryForeground} />
            <Text
              style={{ color: c.primaryForeground, fontSize: 16, fontFamily: fontFamily("semibold") }}
            >
              {authStaff.isPending ? "Checking…" : "Enter"}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
