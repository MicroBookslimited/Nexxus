import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { Card, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

/* ───────────── Drafts (string-backed for smooth text input) ───────────── */

export interface TierDraft {
  minQty: string;
  maxQty: string;
  unitPrice: string;
}

export interface UnitDraft {
  unitName: string;
  conversionFactor: string;
  isPurchase: boolean;
  isSale: boolean;
}

export function emptyTier(): TierDraft {
  return { minQty: "", maxQty: "", unitPrice: "" };
}

export function emptyUnit(): UnitDraft {
  return { unitName: "", conversionFactor: "", isPurchase: true, isSale: false };
}

/* ───────────── Small inline numeric/text input ───────────── */

function MiniInput({
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  flex = 1,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad";
  flex?: number;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      keyboardType={keyboardType}
      style={{
        flex,
        backgroundColor: c.background,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: c.radius,
        paddingHorizontal: 10,
        paddingVertical: 8,
        color: c.foreground,
        fontSize: 14,
        fontFamily: fontFamily("regular"),
      }}
    />
  );
}

function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: c.radius,
        borderWidth: 1,
        borderColor: on ? c.accent : c.border,
        backgroundColor: on ? "rgba(34,211,238,0.12)" : c.background,
      }}
    >
      <Feather name={on ? "check-square" : "square"} size={16} color={on ? c.accent : c.mutedForeground} />
      <Text style={{ color: on ? c.accent : c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: c.foreground, fontSize: 16, fontFamily: fontFamily("semibold") }}>{title}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>{hint}</Text>
    </View>
  );
}

function AddRowButton({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 12,
        borderRadius: c.radius + 2,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: c.border,
      }}
    >
      <Feather name="plus" size={16} color={c.accent} />
      <Text style={{ color: c.accent, fontSize: 14, fontFamily: fontFamily("semibold") }}>{label}</Text>
    </Pressable>
  );
}

/* ───────────── Volume pricing editor ───────────── */

export function VolumePricingEditor({
  value,
  onChange,
}: {
  value: TierDraft[];
  onChange: (next: TierDraft[]) => void;
}) {
  const c = useColors();
  const update = (i: number, patch: Partial<TierDraft>) =>
    onChange(value.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <Card style={{ gap: 12 }}>
      <SectionHeader title="Volume pricing" hint="Lower the unit price when buying in bulk. Leave max empty for the top tier." />
      {value.map((t, i) => (
        <View key={i} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MiniInput value={t.minQty} onChangeText={(v) => update(i, { minQty: v })} placeholder="Min qty" keyboardType="numeric" />
            <MiniInput value={t.maxQty} onChangeText={(v) => update(i, { maxQty: v })} placeholder="Max (opt)" keyboardType="numeric" />
            <MiniInput value={t.unitPrice} onChangeText={(v) => update(i, { unitPrice: v })} placeholder="Unit price" keyboardType="decimal-pad" flex={1.3} />
            <Pressable onPress={() => remove(i)} hitSlop={6}>
              <Feather name="trash-2" size={18} color={c.destructive} />
            </Pressable>
          </View>
        </View>
      ))}
      <AddRowButton label="Add tier" onPress={() => onChange([...value, emptyTier()])} />
    </Card>
  );
}

/* ───────────── Purchase / sale units editor ───────────── */

export function UnitsEditor({
  value,
  onChange,
}: {
  value: UnitDraft[];
  onChange: (next: UnitDraft[]) => void;
}) {
  const c = useColors();
  const update = (i: number, patch: Partial<UnitDraft>) =>
    onChange(value.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <Card style={{ gap: 12 }}>
      <SectionHeader
        title="Purchase / sale units"
        hint="Alternate units (e.g. box, case). Conversion = how many base units this unit holds."
      />
      {value.map((u, i) => (
        <View key={i} style={{ gap: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border, paddingTop: i > 0 ? 12 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MiniInput value={u.unitName} onChangeText={(v) => update(i, { unitName: v })} placeholder="Unit name" flex={1.4} />
            <MiniInput value={u.conversionFactor} onChangeText={(v) => update(i, { conversionFactor: v })} placeholder="Conversion" keyboardType="decimal-pad" />
            <Pressable onPress={() => remove(i)} hitSlop={6}>
              <Feather name="trash-2" size={18} color={c.destructive} />
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Toggle on={u.isPurchase} label="Purchase" onPress={() => update(i, { isPurchase: !u.isPurchase })} />
            <Toggle on={u.isSale} label="Sale" onPress={() => update(i, { isSale: !u.isSale })} />
          </View>
        </View>
      ))}
      <AddRowButton label="Add unit" onPress={() => onChange([...value, emptyUnit()])} />
    </Card>
  );
}
