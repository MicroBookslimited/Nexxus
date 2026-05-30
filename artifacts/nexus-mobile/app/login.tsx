import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Field, fontFamily } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#0B1220", "#10203A", "#0B1220"]} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            padding: 24,
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 420, alignSelf: "center" }}>
          <View style={{ alignItems: "center", marginBottom: 36 }}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={{ width: 88, height: 88, borderRadius: 22, marginBottom: 18 }}
              contentFit="cover"
            />
            <Text style={{ color: c.foreground, fontSize: 30, fontFamily: fontFamily("bold") }}>
              NEXXUS POS
            </Text>
            <Text
              style={{
                color: c.mutedForeground,
                fontSize: 15,
                fontFamily: fontFamily("regular"),
                marginTop: 4,
              }}
            >
              Sign in to your business account
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@business.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={onSubmit}
            />

            {error ? (
              <Text
                style={{
                  color: c.destructive,
                  fontSize: 14,
                  fontFamily: fontFamily("medium"),
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            ) : null}

            <Button label="Sign In" onPress={onSubmit} loading={loading} icon="log-in" />
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}
