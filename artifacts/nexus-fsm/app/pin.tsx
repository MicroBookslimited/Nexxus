import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useStaff } from '@/context/StaffContext';
import { authenticateStaff } from '@/lib/fsm-api';

const PIN_LENGTH = 4;

export default function PinScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tenant, signOut } = useAuth();
  const { setStaff } = useStaff();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  const submit = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      const staff = await authenticateStaff(value);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setStaff({ id: staff.id, name: staff.name, role: staff.role });
    } catch (e) {
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      setError(e instanceof Error ? e.message : 'Invalid PIN');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (digit: string) => {
    if (busy) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (digit === 'del') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + webTop + 24,
          paddingBottom: insets.bottom + webBottom + 24,
        },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.business, { color: colors.mutedForeground }]}>
          {tenant?.businessName ?? ''}
        </Text>
        <Text style={[styles.title, { color: colors.foreground }]}>Enter your PIN</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Identify yourself to see your job queue
        </Text>
      </View>

      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: colors.primary,
                backgroundColor: i < pin.length ? colors.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.errorSlot}>
        {busy ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        ) : null}
      </View>

      <View style={styles.pad}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              testID={`pin-key-${k}`}
              onPress={() => press(k)}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? colors.secondary : colors.card, borderColor: colors.border },
              ]}
            >
              {k === 'del' ? (
                <Feather name="delete" size={22} color={colors.foreground} />
              ) : (
                <Text style={[styles.keyText, { color: colors.foreground }]}>{k}</Text>
              )}
            </Pressable>
          ),
        )}
      </View>

      <Pressable onPress={() => void signOut()} style={styles.switchAccount}>
        <Text style={[styles.switchText, { color: colors.mutedForeground }]}>
          Switch business account
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  header: { alignItems: 'center', marginTop: 12 },
  business: { fontSize: 13, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 6 },
  dots: { flexDirection: 'row', gap: 18, marginTop: 36 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5 },
  errorSlot: { height: 32, justifyContent: 'center', marginTop: 12 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    maxWidth: 320,
    marginTop: 8,
  },
  key: {
    width: 86,
    height: 66,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontSize: 24, fontFamily: 'Inter_600SemiBold' },
  switchAccount: { marginTop: 'auto', padding: 12 },
  switchText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
