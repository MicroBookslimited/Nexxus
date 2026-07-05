import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  SafeAreaInsetsContext,
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingState } from "@/components/ui";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { PrinterProvider } from "@/context/PrinterContext";
import { StaffProvider } from "@/context/StaffContext";
import { getToken } from "@/lib/nexus-api";

// Point the generated API client at the shared proxy domain and let it read the
// tenant token that AuthContext keeps in sync.
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
setAuthTokenGetter(() => getToken());

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Tablet-landscape downscale: the whole app renders on a slightly larger
// virtual canvas that is then scaled down, so every screen shrinks uniformly
// and dense layouts (POS split view, checkout panel) fit on screen without
// per-screen size tweaks. Touches are transform-aware, so taps land correctly.
// Native modals and alerts render in their own windows and stay at 100%.
const TABLET_LANDSCAPE_SCALE = 0.85;

function ScaledApp({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scaleDown = width >= 768 && width > height;
  const s = scaleDown ? TABLET_LANDSCAPE_SCALE : 1;
  // Inset values are measured in real screen pixels but get consumed inside
  // the scaled canvas (where everything renders at s×). Dividing by s keeps
  // the VISUAL padding equal to the real device inset. All screens read
  // insets via the useSafeAreaInsets hook, so this JS override covers them.
  const scaledInsets = useMemo(
    () => ({
      top: insets.top / s,
      bottom: insets.bottom / s,
      left: insets.left / s,
      right: insets.right / s,
    }),
    [insets.top, insets.bottom, insets.left, insets.right, s],
  );
  // The tree shape is identical whether or not scaling is active — only style
  // values change — so crossing the tablet-landscape breakpoint (rotation,
  // split-screen resize) never remounts the navigator or resets screen state.
  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <View
        style={
          scaleDown
            ? {
                width: width / s,
                height: height / s,
                transform: [{ scale: s }],
                transformOrigin: "top left",
              }
            : { flex: 1 }
        }
      >
        <SafeAreaInsetsContext.Provider value={scaledInsets}>
          {children}
        </SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "login";
    if (!token && !inAuthGroup) {
      router.replace("/login");
    } else if (token && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [token, isLoading, segments, router]);

  if (isLoading) return <LoadingState label="Loading…" />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1220" } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="stock-count/[id]" />
      <Stack.Screen name="printer-settings" />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="product/new" />
      <Stack.Screen name="product/edit/[id]" />
      <Stack.Screen name="subscription" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AuthProvider>
                <StaffProvider>
                  <PrinterProvider>
                    <CartProvider>
                      <ScaledApp>
                        <RootLayoutNav />
                      </ScaledApp>
                    </CartProvider>
                  </PrinterProvider>
                </StaffProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
