import { Feather } from "@expo/vector-icons";
import {
  getGetProductCustomizationQueryKey,
  useGetProductCustomization,
  type ChoiceItem,
} from "@workspace/api-client-react";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge, Button, LoadingState, fontFamily } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { formatMoney } from "@/lib/format";

export interface CustomizeResult {
  unitPrice: number;
  variantChoices: ChoiceItem[];
  modifierChoices: ChoiceItem[];
}

export function CustomizeSheet({
  productId,
  visible,
  onClose,
  onAdd,
}: {
  productId: number | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (r: CustomizeResult) => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { data: customization, isLoading } = useGetProductCustomization(productId ?? 0, {
    query: {
      enabled: visible && productId != null,
      queryKey: getGetProductCustomizationQueryKey(productId ?? 0),
    },
  });

  const [selectedVariants, setSelectedVariants] = useState<Record<number, ChoiceItem>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Set<number>>(new Set());

  // Reset selections whenever a different product opens.
  const [lastProductId, setLastProductId] = useState<number | null>(null);
  if (visible && productId !== lastProductId) {
    setLastProductId(productId);
    setSelectedVariants({});
    setSelectedModifiers(new Set());
  }

  const modifierMap = useMemo(() => {
    const m = new Map<number, ChoiceItem>();
    if (!customization) return m;
    for (const group of customization.modifierGroups) {
      for (const opt of group.options) {
        m.set(opt.id, {
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          priceAdjustment: opt.priceAdjustment,
        });
      }
    }
    return m;
  }, [customization]);

  const { variantPrice, modifierAdj } = useMemo(() => {
    const isMultiGroup = (customization?.variantGroups.length ?? 0) >= 2;
    let variantPrice: number | null = null;

    if (isMultiGroup && customization) {
      const allGroupsSelected = customization.variantGroups.every((g) => selectedVariants[g.id]);
      if (allGroupsSelected) {
        const label = customization.variantGroups
          .map((g) => selectedVariants[g.id]?.optionName ?? "")
          .join("/");
        const combo = customization.combinations?.find((x) => x.label === label);
        if (combo?.price != null && combo.price > 0) variantPrice = combo.price;
      }
    } else {
      for (const v of Object.values(selectedVariants)) {
        if (v.priceAdjustment > 0) {
          variantPrice = v.priceAdjustment;
          break;
        }
      }
    }

    let modifierAdj = 0;
    for (const id of selectedModifiers) {
      const m = modifierMap.get(id);
      if (m) modifierAdj += m.priceAdjustment;
    }
    return { variantPrice, modifierAdj };
  }, [customization, selectedVariants, selectedModifiers, modifierMap]);

  const isValid = useMemo(() => {
    if (!customization) return false;
    for (const g of customization.variantGroups) {
      if (g.required && !selectedVariants[g.id]) return false;
    }
    for (const g of customization.modifierGroups) {
      const count = [...selectedModifiers].filter((id) => modifierMap.get(id)?.groupId === g.id).length;
      if (g.required && g.minSelections > 0 && count < g.minSelections) return false;
    }
    return true;
  }, [customization, selectedVariants, selectedModifiers, modifierMap]);

  const basePrice = customization?.basePrice ?? 0;
  const unitPrice = (variantPrice ?? basePrice) + modifierAdj;

  const toggleModifier = (groupId: number, optId: number, maxSelections: number) => {
    setSelectedModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(optId)) {
        next.delete(optId);
      } else {
        const groupCount = [...next].filter((id) => modifierMap.get(id)?.groupId === groupId).length;
        if (maxSelections > 0 && groupCount >= maxSelections) return prev;
        next.add(optId);
      }
      return next;
    });
  };

  const handleAdd = () => {
    if (!isValid) return;
    const variantChoices = Object.values(selectedVariants);
    const modifierChoices = [...selectedModifiers].map((id) => modifierMap.get(id)!).filter(Boolean);
    onAdd({ unitPrice, variantChoices, modifierChoices });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "88%",
            paddingBottom: insets.bottom,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: c.border,
            }}
          >
            <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold"), flex: 1 }}>
              {isLoading ? "Loading…" : customization?.productName ?? "Customize"}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={26} color={c.foreground} />
            </Pressable>
          </View>

          {isLoading ? (
            <LoadingState label="Loading options…" />
          ) : customization ? (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
              {customization.variantGroups.map((group) => (
                <View key={group.id} style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                      {group.name}
                    </Text>
                    {group.required ? <Badge label="Required" tone="danger" /> : null}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {group.options.map((opt) => {
                      const selected = selectedVariants[group.id]?.optionId === opt.id;
                      return (
                        <OptionChip
                          key={opt.id}
                          label={opt.name}
                          adjustment={opt.priceAdjustment}
                          selected={selected}
                          onPress={() =>
                            setSelectedVariants((prev) => ({
                              ...prev,
                              [group.id]: {
                                groupId: group.id,
                                groupName: group.name,
                                optionId: opt.id,
                                optionName: opt.name,
                                priceAdjustment: opt.priceAdjustment,
                              },
                            }))
                          }
                        />
                      );
                    })}
                  </View>
                </View>
              ))}

              {customization.modifierGroups.map((group) => (
                <View key={group.id} style={{ gap: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }}>
                      {group.name}
                    </Text>
                    {group.required ? <Badge label="Required" tone="danger" /> : null}
                    {group.maxSelections > 0 ? (
                      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>max {group.maxSelections}</Text>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {group.options.map((opt) => (
                      <OptionChip
                        key={opt.id}
                        label={opt.name}
                        adjustment={opt.priceAdjustment}
                        selected={selectedModifiers.has(opt.id)}
                        onPress={() => toggleModifier(group.id, opt.id, group.maxSelections)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ padding: 24 }}>
              <Text style={{ color: c.mutedForeground, textAlign: "center" }}>No options available.</Text>
            </View>
          )}

          {/* Footer price + add */}
          <View
            style={{
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: c.border,
              gap: 12,
              backgroundColor: c.card,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: fontFamily("medium") }}>
                Item price
              </Text>
              <Text style={{ color: c.accent, fontSize: 18, fontFamily: fontFamily("bold") }}>
                {formatMoney(unitPrice)}
              </Text>
            </View>
            <Button label="Add to Cart" icon="plus" onPress={handleAdd} disabled={!isValid} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function OptionChip({
  label,
  adjustment,
  selected,
  onPress,
}: {
  label: string;
  adjustment: number;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: selected ? c.primary : c.border,
        backgroundColor: selected ? c.primary + "22" : c.secondary,
      }}
    >
      <Text style={{ color: selected ? c.primary : c.foreground, fontFamily: fontFamily("medium"), fontSize: 14 }}>
        {label}
      </Text>
      {adjustment !== 0 ? (
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          {adjustment > 0 ? "+" : ""}
          {formatMoney(adjustment)}
        </Text>
      ) : null}
    </Pressable>
  );
}
