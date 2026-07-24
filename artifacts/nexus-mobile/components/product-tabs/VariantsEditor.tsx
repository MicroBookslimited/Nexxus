import {
  useGetProductVariants,
  useSaveProductVariants,
  getGetProductVariantsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Switch, Text, View } from "react-native";

import { Button, Card, Field, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";

type DraftOption = {
  /** Stable local identity — survives renames. `o<serverId>` or `n<counter>`. */
  localId: string;
  optionId: number | null;
  name: string;
  priceAdjustment: string;
  stockCount: string;
  sku: string;
};
type DraftGroup = { groupId: number | null; name: string; required: boolean; options: DraftOption[] };
type ComboOverride = { combinationId: number | null; price: string; stockCount: string; sku: string };

export function VariantsEditor({ productId }: { productId: number }) {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading } = useGetProductVariants(productId);
  const saveVariants = useSaveProductVariants();

  const [groups, setGroups] = useState<DraftGroup[]>([]);
  // Overrides keyed by the stable localId tuple ("o12|o15"), NOT display labels,
  // so renaming an option never orphans (and thereby wipes) its combination data.
  const [comboOverrides, setComboOverrides] = useState<Map<string, ComboOverride>>(new Map());
  const [seeded, setSeeded] = useState(false);
  const localCounter = useRef(0);

  const newLocalId = () => `n${++localCounter.current}`;
  const emptyOption = (): DraftOption => ({
    localId: newLocalId(),
    optionId: null,
    name: "",
    priceAdjustment: "0",
    stockCount: "",
    sku: "",
  });

  useEffect(() => {
    if (!data || seeded) return;
    setGroups(
      data.groups.map((g) => ({
        groupId: g.id,
        name: g.name,
        required: g.required,
        options: g.options.map((o) => ({
          localId: `o${o.id}`,
          optionId: o.id,
          name: o.name,
          priceAdjustment: String(o.priceAdjustment ?? 0),
          stockCount: o.stockCount != null ? String(o.stockCount) : "",
          sku: o.sku ?? "",
        })),
      })),
    );
    const overrides = new Map<string, ComboOverride>();
    data.combinations.forEach((cb) => {
      // Server gives the option-id tuple directly — use it as the stable key.
      const key = cb.optionIds.map((id) => `o${id}`).join("|");
      overrides.set(key, {
        combinationId: cb.id,
        price: cb.price != null ? String(cb.price) : "",
        stockCount: cb.stockCount != null ? String(cb.stockCount) : "",
        sku: cb.sku ?? "",
      });
    });
    setComboOverrides(overrides);
    setSeeded(true);
  }, [data, seeded]);

  const multiGroup = groups.filter((g) => g.options.some((o) => o.name.trim() !== "")).length >= 2;

  // Cartesian product across groups, carrying stable localIds + display names.
  const combos = useMemo(() => {
    if (!multiGroup) return [];
    const lists = groups
      .map((g) => g.options.filter((o) => o.name.trim() !== ""))
      .filter((l) => l.length > 0);
    if (lists.length < 2) return [];
    let acc: DraftOption[][] = [[]];
    for (const list of lists) {
      const next: DraftOption[][] = [];
      for (const prefix of acc) for (const opt of list) next.push([...prefix, opt]);
      acc = next;
    }
    return acc.map((opts) => ({
      key: opts.map((o) => o.localId).join("|"),
      label: opts.map((o) => o.name.trim()).join(" / "),
      optionNames: opts.map((o) => o.name.trim()),
    }));
  }, [groups, multiGroup]);

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
  const patchCombo = (key: string, patch: Partial<ComboOverride>) =>
    setComboOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(key) ?? { combinationId: null, price: "", stockCount: "", sku: "" };
      next.set(key, { ...cur, ...patch });
      return next;
    });

  async function onSave() {
    // Guard against duplicate names: the server resolves combinations by option
    // NAME within each group, so duplicates would be ambiguous.
    for (const g of groups) {
      const names = g.options.map((o) => o.name.trim().toLowerCase()).filter(Boolean);
      if (new Set(names).size !== names.length)
        return Alert.alert("Variants", `Group "${g.name || "(unnamed)"}" has duplicate option names.`);
    }
    const groupNames = groups.map((g) => g.name.trim().toLowerCase()).filter(Boolean);
    if (new Set(groupNames).size !== groupNames.length)
      return Alert.alert("Variants", "Two variant groups have the same name.");

    const cleanedGroups = groups
      .map((g) => ({
        ...(g.groupId != null ? { groupId: g.groupId } : {}),
        name: g.name.trim(),
        required: g.required,
        options: g.options
          .filter((o) => o.name.trim() !== "")
          .map((o) => ({
            ...(o.optionId != null ? { optionId: o.optionId } : {}),
            name: o.name.trim(),
            priceAdjustment: Number(o.priceAdjustment) || 0,
            stockCount: o.stockCount.trim() === "" ? null : Number(o.stockCount),
            sku: o.sku.trim() || undefined,
          })),
      }))
      .filter((g) => g.name !== "" && g.options.length > 0);

    const body = {
      groups: cleanedGroups,
      ...(multiGroup
        ? {
            combinations: combos.map((cb) => {
              const ov = comboOverrides.get(cb.key);
              return {
                ...(ov?.combinationId != null ? { combinationId: ov.combinationId } : {}),
                optionNames: cb.optionNames,
                price: ov?.price.trim() ? Number(ov.price) : null,
                stockCount: ov?.stockCount.trim() ? Number(ov.stockCount) : null,
                sku: ov?.sku.trim() || undefined,
              };
            }),
          }
        : {}),
    };

    try {
      await saveVariants.mutateAsync({ id: productId, data: body });
      // Re-seed from the server's canonical response (new option/combination ids).
      setSeeded(false);
      await qc.invalidateQueries({ queryKey: getGetProductVariantsQueryKey(productId) });
      Alert.alert("Saved", "Variants updated.");
    } catch (e) {
      Alert.alert("Could not save variants", (e as Error).message);
    }
  }

  if (isLoading) return <LoadingState label="Loading variants…" />;

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
        Variants are choices like Size or Color. With one group, price and stock are set per
        option; with two or more groups, they are set per combination below.
      </Text>

      {groups.map((g, gi) => (
        <Card key={g.groupId ?? `new-${gi}`} style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Group name"
                value={g.name}
                onChangeText={(v) => patchGroup(gi, { name: v })}
                placeholder="e.g. Size"
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

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.foreground, fontSize: 14, fontFamily: fontFamily("medium") }}>
              Required at checkout
            </Text>
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
            <View key={o.localId} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
                <View style={{ flex: 2 }}>
                  <Field
                    label={oi === 0 ? "Name" : undefined}
                    value={o.name}
                    onChangeText={(v) => patchOption(gi, oi, { name: v })}
                    placeholder="e.g. Large"
                  />
                </View>
                {!multiGroup ? (
                  <>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={oi === 0 ? "+ Price" : undefined}
                        value={o.priceAdjustment}
                        onChangeText={(v) => patchOption(gi, oi, { priceAdjustment: v })}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={oi === 0 ? "Qty" : undefined}
                        value={o.stockCount}
                        onChangeText={(v) => patchOption(gi, oi, { stockCount: v })}
                        keyboardType="numeric"
                        placeholder="—"
                      />
                    </View>
                  </>
                ) : null}
                <Pressable
                  onPress={() => patchGroup(gi, { options: g.options.filter((_, ox) => ox !== oi) })}
                  hitSlop={8}
                  style={{ paddingBottom: 12 }}
                >
                  <Feather name="x" size={18} color={c.mutedForeground} />
                </Pressable>
              </View>
            </View>
          ))}
          <Button label="Add option" icon="plus" variant="secondary" onPress={() => patchGroup(gi, { options: [...g.options, emptyOption()] })} />
        </Card>
      ))}

      <Button
        label="Add variant group"
        icon="plus"
        variant="secondary"
        onPress={() => setGroups((gs) => [...gs, { groupId: null, name: "", required: true, options: [emptyOption()] }])}
      />

      {multiGroup && combos.length > 0 ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
            Combinations ({combos.length})
          </Text>
          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
            Set price, stock and SKU for each combination. Blank price = product base price.
          </Text>
          {combos.map((cb) => {
            const ov = comboOverrides.get(cb.key);
            return (
              <View key={cb.key} style={{ gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 }}>
                <Text style={{ color: c.foreground, fontSize: 13, fontFamily: fontFamily("medium") }}>{cb.label}</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Field
                      value={ov?.price ?? ""}
                      onChangeText={(v) => patchCombo(cb.key, { price: v })}
                      keyboardType="decimal-pad"
                      placeholder="Price"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      value={ov?.stockCount ?? ""}
                      onChangeText={(v) => patchCombo(cb.key, { stockCount: v })}
                      keyboardType="numeric"
                      placeholder="Qty"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      value={ov?.sku ?? ""}
                      onChangeText={(v) => patchCombo(cb.key, { sku: v })}
                      placeholder="SKU"
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Button label="Save variants" icon="check" onPress={onSave} loading={saveVariants.isPending} />
    </View>
  );
}
