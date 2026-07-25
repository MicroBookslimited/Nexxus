import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Field, fontFamily } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const COUNTRIES = [
  "Jamaica", "United States", "Canada", "United Kingdom", "Trinidad & Tobago",
  "Barbados", "Guyana", "Bahamas", "Belize", "Other",
];

export default function SignupScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Jamaica");
  const [referralCode, setReferralCode] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    if (!businessName.trim()) { setError("Business name is required."); return; }
    if (!ownerName.trim()) { setError("Owner / admin name is required."); return; }
    if (!email.trim()) { setError("Email is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!acceptedTerms) { setError("You must accept the Terms & Conditions to continue."); return; }

    setLoading(true);
    try {
      await signUp({
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: phone.trim() || undefined,
        country: country || undefined,
        referralCode: referralCode.trim() || undefined,
      });
      // AuthContext.signUp stores the token → root layout auto-navigates to (tabs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed. Please try again.");
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
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 480, alignSelf: "center" }}>

            {/* Header */}
            <View style={{ alignItems: "center", marginBottom: 28 }}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 72, height: 72, borderRadius: 18, marginBottom: 14 }}
                contentFit="cover"
              />
              <Text style={{ color: c.foreground, fontSize: 26, fontFamily: fontFamily("bold") }}>
                Create your account
              </Text>
              <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: fontFamily("regular"), marginTop: 4, textAlign: "center" }}>
                Start your 3-day free trial — no credit card required
              </Text>
            </View>

            {/* Form */}
            <View style={{ gap: 14 }}>

              {/* Business info */}
              <SectionLabel label="BUSINESS" color={c.mutedForeground} />
              <Field
                label="Business Name"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="My Store"
                autoCapitalize="words"
                autoComplete="organization"
              />
              <Field
                label="Owner / Admin Name"
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="Jane Smith"
                autoCapitalize="words"
                autoComplete="name"
              />

              {/* Account info */}
              <SectionLabel label="ACCOUNT" color={c.mutedForeground} />
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
                label="Password (min 8 characters)"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <Field
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />

              {/* Optional info */}
              <SectionLabel label="OPTIONAL" color={c.mutedForeground} />
              <Field
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 876 000 0000"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />
              <CountryPicker value={country} onChange={setCountry} colors={c} />
              <Field
                label="Referral / Reseller Code"
                value={referralCode}
                onChangeText={setReferralCode}
                placeholder="Optional"
                autoCapitalize="characters"
              />

              {/* Terms */}
              <Pressable
                onPress={() => setAcceptedTerms((v) => !v)}
                style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 4 }}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4, marginTop: 1,
                  borderWidth: 1.5,
                  borderColor: acceptedTerms ? c.accent : c.border,
                  backgroundColor: acceptedTerms ? c.accent : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {acceptedTerms ? (
                    <Text style={{ color: "#fff", fontSize: 13, fontFamily: fontFamily("bold") }}>✓</Text>
                  ) : null}
                </View>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("regular"), flex: 1, lineHeight: 18 }}>
                  I agree to the{" "}
                  <Text style={{ color: c.accent, fontFamily: fontFamily("medium") }}>Terms & Conditions</Text>
                  {" "}and{" "}
                  <Text style={{ color: c.accent, fontFamily: fontFamily("medium") }}>Privacy Policy</Text>
                  . A 3-day free trial starts immediately after sign-up.
                </Text>
              </Pressable>

              {/* Error */}
              {error ? (
                <Text style={{ color: c.destructive, fontSize: 13, fontFamily: fontFamily("medium"), textAlign: "center" }}>
                  {error}
                </Text>
              ) : null}

              {/* Submit */}
              <Button
                label={loading ? "Creating account…" : "Create Account"}
                onPress={onSubmit}
                loading={loading}
                icon="user-plus"
              />

              {/* Already have an account */}
              <Pressable
                onPress={() => router.replace("/login")}
                style={{ alignItems: "center", paddingVertical: 6 }}
              >
                <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: fontFamily("regular") }}>
                  Already have an account?{" "}
                  <Text style={{ color: c.accent, fontFamily: fontFamily("semibold") }}>Sign in</Text>
                </Text>
              </Pressable>

            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ color, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, marginTop: 4 }}>
      {label}
    </Text>
  );
}

const COUNTRY_LIST = [
  "Jamaica", "United States", "Canada", "United Kingdom",
  "Trinidad & Tobago", "Barbados", "Guyana", "Bahamas", "Belize",
  "Antigua & Barbuda", "Saint Lucia", "Saint Vincent", "Grenada",
  "Dominican Republic", "Haiti", "Cuba", "Panama", "Costa Rica",
  "Mexico", "Brazil", "Colombia", "Venezuela", "Other",
];

function CountryPicker({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 }}>
        Country
      </Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          paddingHorizontal: 12, paddingVertical: 11,
          backgroundColor: colors.card,
        }}
      >
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_400Regular" }}>{value}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{open ? "▲" : "▼"}</Text>
      </Pressable>
      {open ? (
        <View style={{
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          marginTop: 4, backgroundColor: colors.card,
          maxHeight: 200, overflow: "hidden",
        }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {COUNTRY_LIST.map((c) => (
              <Pressable
                key={c}
                onPress={() => { onChange(c); setOpen(false); }}
                style={({ pressed }) => ({
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: pressed ? colors.secondary : c === value ? colors.accent + "22" : "transparent",
                  borderBottomWidth: 1, borderBottomColor: colors.border,
                })}
              >
                <Text style={{
                  color: c === value ? colors.accent : colors.foreground,
                  fontSize: 14,
                  fontFamily: c === value ? "Inter_600SemiBold" : "Inter_400Regular",
                }}>
                  {c}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
