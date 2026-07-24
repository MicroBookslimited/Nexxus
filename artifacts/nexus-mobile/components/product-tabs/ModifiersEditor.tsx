import {
  useGetProductModifiers,
  useSaveProductModifiers,
  getGetProductModifiersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import { Button, Card, Field, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

type DraftOption = { name: string; priceAdjustment: string };
type DraftGroup = {
  name: string;
  required: boolean;
  minSelections: string;
  maxSelections: string;
  options: DraftOption[];
};

export function ModifiersEditor({ productId }: { productId: number }) {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading } = useGetProductModifiers(productId);
  const saveModifiers = useSaveProductModifiers();

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!data || seeded) return;
    setGroups(
      data.map((g) => ({
        name: g.name,
        required: g.required,
        minSelections: String(g.minSelections ?? 0),
        maxSelections: String(g.maxSelections ?? 0),
        options: g.options.map((o) => ({
          name: o.name,
          priceAdjustment: String(o.priceAdjustment ?? 0),
        })),
      })),
    );
    setSeeded(true);
  }, [data, seeded]);

  const patchGroup = (i: number, patch: Partial<DraftGroup>) =>
    setGroups((gs) => gs.map((g, ix) => (ix === i ? { ...g, ...patch } : g)));
  const patchOption = (gi: number, oi: number, patch: Partial<DraftOption>) =>
    setGroups((gs) =>
      gs.map((g, ix) =>
        ix === gi
          ? { ...g, options: g.options.map((o, ox) => (ox === oi ? { ...o, ...patch } : o)) }
          : g,
      ),
    );

  async function onSave() {
    const cleaned = groups
      .map((g) => ({
        name: g.name.trim(),
        required: g.required,
        minSelections: Number(g.minSelections) || 0,
        maxSelections: Number(g.maxSelections) || 0,
        options: g.options
          .map((o) => ({ name: o.name.trim(), priceAdjustment: Number(o.priceAdjustment) || 0 }))
          .filter((o) => o.name !== ""),
      }))
      .filter((g) => g.name !== "");
    for (const g of cleaned) {
      if (g.options.length === 0)
        return Alert.alert("Modifiers", `Group "${g.name}" needs at least one option.`);
    }
    try {
      await saveModifiers.mutateAsync({ id: productId, data: { groups: cleaned } });
      setSeeded(false);
      await qc.invalidateQueries({ queryKey: getGetProductModifiersQueryKey(productId) });
      Alert.alert("Saved", "Modifiers updated.");
    } catch (e) {
      Alert.alert("Could not save modifiers", (e as Error).message);
    }
  }

  if (isLoading) return <LoadingState label="Loading modifiers…" />;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
        Modifiers are add-ons like "Extra cheese" or "No ice". Each group can require a
        minimum / maximum number of selections.
      </Text>

      {groups.map((g, gi) => (
        <Card key={gi} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Group name"
                value={g.name}
                onChangeText={(v) => patchGroup(gi, { name: v })}
                placeholder="e.g. Extras"
              />
            </View>
            <Pressable
              onPress={() => setGroups((gs) => gs.filter((_, ix) => ix !== gi))}
              hitSlop={8}
              style={{ paddingTop: 18 }}
            >
              <Feather name="trash-2" size={18} color={c.destructive} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Min selections"
                value={g.minSelections}
                onChangeText={(v) => patchGroup(gi, { minSelections: v })}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Max (0 = no limit)"
                value={g.maxSelections}
                onChangeText={(v) => patchGroup(gi, { maxSelections: v })}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium") }}>Required</Text>
            <Switch
              value={g.required}
              onValueChange={(v) => patchGroup(gi, { required: v })}
              trackColor={{ true: c.primary, false: c.border }}
            />
          </View>

          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: fontFamily("semibold"), textTransform: "uppercase" }}>
            Options
          </Text>
          {g.options.map((o, oi) => (
            <View key={oi} style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
              <View style={{ flex: 2 }}>
                <Field
                  label={oi === 0 ? "Name" : undefined}
                  value={o.name}
                  onChangeText={(v) => patchOption(gi, oi, { name: v })}
                  placeholder="e.g. Extra cheese"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={oi === 0 ? "+ Price" : undefined}
                  value={o.priceAdjustment}
                  onChangeText={(v) => patchOption(gi, oi, { priceAdjustment: v })}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              <Pressable
                onPress={() =>
                  patchGroup(gi, { options: g.options.filter((_, ox) => ox !== oi) })
                }
                hitSlop={8}
                style={{ paddingBottom: 12 }}
              >
                <Feather name="x" size={18} color={c.mutedForeground} />
              </Pressable>
            </View>
          ))}
          <Button
            label="Add option"
            icon="plus"
            variant="secondary"
            onPress={() => patchGroup(gi, { options: [...g.options, { name: "", priceAdjustment: "0" }] })}
          />
        </Card>
      ))}

      <Button
        label="Add modifier group"
        icon="plus"
        variant="secondary"
        onPress={() =>
          setGroups((gs) => [
            ...gs,
            { name: "", required: false, minSelections: "0", maxSelections: "0", options: [{ name: "", priceAdjustment: "0" }] },
          ])
        }
      />
      <Button label="Save modifiers" icon="check" onPress={onSave} loading={saveModifiers.isPending} />
    </View>
  );
}
