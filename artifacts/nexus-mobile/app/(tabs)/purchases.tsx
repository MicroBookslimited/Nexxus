import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useListProducts, type Product } from "@workspace/api-client-react";
import React, { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AppHeader,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  SearchBar,
  fontFamily,
  useScreenPadding,
} from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatDate } from "@/lib/format";
import {
  confirmPurchaseBill,
  createPurchaseBill,
  deletePurchaseBill,
  getPurchaseBill,
  listPurchaseBills,
  type CostChange,
  type PurchaseBill,
  type PurchaseBillWithItems,
} from "@/lib/nexus-api";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Root screen
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PurchasesScreen() {
  const c = useColors();
  const [tab, setTab] = useState<"drafts" | "all">("drafts");
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <AppHeader title="Purchases" subtitle="Bills & supplier invoices" />

      <View style={{ flexDirection: "row", gap: 10, padding: 16, paddingBottom: 8 }}>
        <Chip label="Drafts" active={tab === "drafts"} onPress={() => setTab("drafts")} />
        <Chip label="All Bills" active={tab === "all"} onPress={() => setTab("all")} />
      </View>

      <BillListTab
        statusFilter={tab === "drafts" ? "draft" : undefined}
        onNew={() => setNewOpen(true)}
        onOpen={(id) => setDetailId(id)}
      />

      {newOpen && (
        <NewBillModal
          visible
          onClose={() => setNewOpen(false)}
          onSaved={() => setNewOpen(false)}
        />
      )}

      {detailId !== null && (
        <BillDetailModal
          billId={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Bill list
   ═══════════════════════════════════════════════════════════════════════════ */

function BillListTab({
  statusFilter,
  onNew,
  onOpen,
}: {
  statusFilter?: "draft";
  onNew: () => void;
  onOpen: (id: number) => void;
}) {
  const c = useColors();
  const pad = useScreenPadding();
  const lay = useResponsive();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["purchase-bills"],
    queryFn: listPurchaseBills,
  });

  const bills = useMemo(() => {
    if (!data) return [];
    if (statusFilter) return data.filter((b) => b.status === statusFilter);
    return data;
  }, [data, statusFilter]);

  if (isLoading) return <LoadingState label="Loading bills…" />;
  if (error) return <ErrorState message="Could not load purchase bills." onRetry={refetch} />;

  return (
    <>
      <FlatList
        data={bills}
        keyExtractor={(b) => String(b.id)}
        contentContainerStyle={{
          padding: 16,
          paddingTop: 8,
          gap: 10,
          paddingBottom: pad.bottom + 80,
          width: "100%",
          maxWidth: lay.contentMaxWidth,
          alignSelf: "center",
        }}
        ListEmptyComponent={
          <EmptyState
            icon="file-text"
            title={statusFilter === "draft" ? "No draft bills" : "No purchase bills yet"}
            subtitle="Tap the button below to record a new purchase."
          />
        }
        renderItem={({ item }) => <BillCard bill={item} onPress={() => onOpen(item.id)} />}
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pad.bottom - 8, alignItems: "center", paddingHorizontal: 16 }}>
        <View style={{ width: "100%", maxWidth: lay.contentMaxWidth }}>
          <Button label="New Purchase Bill" icon="plus" onPress={onNew} />
        </View>
      </View>
    </>
  );
}

function BillCard({ bill, onPress }: { bill: PurchaseBill; onPress: () => void }) {
  const c = useColors();
  const isDraft = bill.status === "draft";
  return (
    <Card onPress={onPress} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("semibold") }} numberOfLines={1}>
            {bill.billNumber}
          </Text>
          {bill.supplier ? (
            <Text style={{ color: c.mutedForeground, fontSize: 12 }} numberOfLines={1}>
              {bill.supplier}
            </Text>
          ) : null}
        </View>
        <Badge label={isDraft ? "Draft" : "Confirmed"} tone={isDraft ? "warning" : "success"} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
          {bill.itemCount ?? "–"} item{bill.itemCount !== 1 ? "s" : ""} · {formatDate(bill.createdAt)}
        </Text>
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: fontFamily("bold") }}>
          {fmtCurrency(bill.totalCost)}
        </Text>
      </View>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Bill detail / confirm modal
   ═══════════════════════════════════════════════════════════════════════════ */

function BillDetailModal({ billId, onClose }: { billId: number; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const lay = useResponsive();
  const qc = useQueryClient();
  const [costChanges, setCostChanges] = useState<CostChange[]>([]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["purchase-bill", billId],
    queryFn: () => getPurchaseBill(billId),
  });

  const confirmMut = useMutation({
    mutationFn: () => confirmPurchaseBill(billId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      qc.invalidateQueries({ queryKey: ["purchase-bill", billId] });
      if (res.costChanges?.length) setCostChanges(res.costChanges);
    },
    onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Could not confirm bill."),
  });

  const deleteMut = useMutation({
    mutationFn: () => deletePurchaseBill(billId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      onClose();
    },
    onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Could not delete bill."),
  });

  const handleDelete = () => {
    Alert.alert("Delete draft?", "This will permanently delete the draft bill.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() },
    ]);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Feather name="arrow-left" size={24} color={c.foreground} />
          </Pressable>
          <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold"), flex: 1, marginLeft: 12 }}>
            {data?.billNumber ?? "Purchase Bill"}
          </Text>
          {data?.status === "draft" && (
            <Pressable onPress={handleDelete} hitSlop={10}>
              <Feather name="trash-2" size={20} color="#ef4444" />
            </Pressable>
          )}
        </View>

        {isLoading ? (
          <LoadingState label="Loading bill…" />
        ) : error ? (
          <ErrorState message="Could not load bill." onRetry={refetch} />
        ) : data ? (
          <>
            {/* Cost change notice */}
            {costChanges.length > 0 && (
              <View style={{ margin: 16, padding: 12, backgroundColor: "#f59e0b22", borderRadius: 8, borderWidth: 1, borderColor: "#f59e0b66" }}>
                <Text style={{ color: "#f59e0b", fontFamily: fontFamily("semibold"), marginBottom: 4 }}>
                  Cost prices updated
                </Text>
                {costChanges.map((cc) => (
                  <Text key={cc.productId} style={{ color: c.mutedForeground, fontSize: 12 }}>
                    {cc.productName}: {fmtCurrency(cc.oldCost ?? 0)} → {fmtCurrency(cc.newCost)}
                  </Text>
                ))}
              </View>
            )}

            <ScrollView
              contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 100, maxWidth: lay.contentMaxWidth, width: "100%", alignSelf: "center" }}
            >
              {/* Meta */}
              <Card style={{ gap: 10 }}>
                <Row label="Supplier" value={data.supplier || "—"} />
                <Row label="Status" value={data.status === "draft" ? "Draft" : "Confirmed"} highlight={data.status === "draft"} />
                <Row label="Tax Mode" value={data.taxMode === "inclusive" ? "Tax Inclusive" : "Tax Exclusive"} />
                {data.defaultTaxRate > 0 && <Row label="Default Tax" value={`${data.defaultTaxRate}%`} />}
                {data.notes ? <Row label="Notes" value={data.notes} /> : null}
                <Row label="Date" value={formatDate(data.createdAt)} />
              </Card>

              {/* Items */}
              <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 15 }}>
                Items ({data.items.length})
              </Text>
              {data.items.map((item, i) => (
                <Card key={item.id} style={{ gap: 6 }}>
                  <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>
                    {item.productName ?? `Product #${item.productId}`}
                  </Text>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                      {item.quantity} × {fmtCurrency(item.unitCost)}
                      {item.taxRate ? ` + ${item.taxRate}% tax` : ""}
                    </Text>
                    <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 13 }}>
                      {fmtCurrency(item.totalCost)}
                    </Text>
                  </View>
                  {item.batchNumber ? (
                    <Text style={{ color: c.mutedForeground, fontSize: 11 }}>Batch: {item.batchNumber}{item.expiryDate ? ` · Exp: ${item.expiryDate}` : ""}</Text>
                  ) : null}
                </Card>
              ))}

              {/* Totals */}
              <Card style={{ gap: 8 }}>
                <Row label="Subtotal" value={fmtCurrency(data.subtotal)} />
                {data.taxTotal > 0 && <Row label="Tax" value={fmtCurrency(data.taxTotal)} />}
                <Divider />
                <Row label="Total Cost" value={fmtCurrency(data.totalCost)} bold />
              </Card>
            </ScrollView>

            {/* Confirm button for drafts */}
            {data.status === "draft" && (
              <View style={{ padding: 16, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: c.border }}>
                <Button
                  label="Confirm Bill & Update Stock"
                  icon="check-circle"
                  onPress={() => {
                    Alert.alert(
                      "Confirm this bill?",
                      "Stock will be increased and a journal entry will be posted. This cannot be undone.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Confirm", onPress: () => confirmMut.mutate() },
                      ],
                    );
                  }}
                  loading={confirmMut.isPending}
                />
              </View>
            )}
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function Row({ label, value, bold, highlight }: { label: string; value: string; bold?: boolean; highlight?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: highlight ? "#f59e0b" : c.foreground, fontSize: 13, fontFamily: fontFamily(bold ? "bold" : "medium"), textAlign: "right", flex: 2 }}>
        {value}
      </Text>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   New bill modal — 3-step wizard: Header → Items → Review & Save
   ═══════════════════════════════════════════════════════════════════════════ */

interface DraftLine {
  productId: number;
  productName: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

function NewBillModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const lay = useResponsive();
  const qc = useQueryClient();

  const [step, setStep] = useState<"header" | "items" | "review">("header");

  // Step 1 — header fields
  const [billNumber, setBillNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [defaultTaxRate, setDefaultTaxRate] = useState("0");

  // Step 2 — items
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [editingLine, setEditingLine] = useState<DraftLine | null>(null);

  // Submit
  const [saveMode, setSaveMode] = useState<"draft" | "confirmed">("draft");
  const [costChanges, setCostChanges] = useState<CostChange[]>([]);
  const [done, setDone] = useState(false);

  const { data: products } = useListProducts({});

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = itemSearch.toLowerCase();
    return (products as Product[]).filter(
      (p) => p.name?.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
    ).slice(0, 30);
  }, [products, itemSearch]);

  const subtotal = useMemo(() =>
    lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0), 0),
    [lines],
  );

  const save = useMutation({
    mutationFn: () =>
      createPurchaseBill({
        billNumber: billNumber.trim(),
        supplier: supplier.trim() || undefined,
        notes: notes.trim() || undefined,
        status: saveMode,
        defaultTaxRate: parseFloat(defaultTaxRate) || 0,
        taxMode,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: parseInt(l.quantity, 10) || 1,
          unitCost: parseFloat(l.unitCost) || 0,
          taxRate: parseFloat(l.taxRate) || null,
        })),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["purchase-bills"] });
      if (res.costChanges?.length) setCostChanges(res.costChanges);
      setDone(true);
    },
    onError: (e) => Alert.alert("Error", e instanceof Error ? e.message : "Could not save bill."),
  });

  const reset = () => {
    setStep("header");
    setBillNumber("");
    setSupplier("");
    setNotes("");
    setTaxMode("exclusive");
    setDefaultTaxRate("0");
    setLines([]);
    setSaveMode("draft");
    setCostChanges([]);
    setDone(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: insets.top }}>
        {/* Header bar */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <Pressable onPress={handleClose} hitSlop={10}>
            <Feather name="x" size={24} color={c.foreground} />
          </Pressable>
          <Text style={{ color: c.foreground, fontSize: 18, fontFamily: fontFamily("bold"), flex: 1, marginLeft: 12 }}>
            {done ? "Bill Saved" : step === "header" ? "Bill Details" : step === "items" ? "Add Items" : "Review Bill"}
          </Text>
          {!done && (
            <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
              {step === "header" ? "1/3" : step === "items" ? "2/3" : "3/3"}
            </Text>
          )}
        </View>

        {/* Done state */}
        {done ? (
          <ScrollView contentContainerStyle={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 16 }}>
            <Feather name="check-circle" size={64} color="#22c55e" />
            <Text style={{ color: c.foreground, fontSize: 22, fontFamily: fontFamily("bold"), textAlign: "center" }}>
              {saveMode === "confirmed" ? "Bill Confirmed!" : "Draft Saved!"}
            </Text>
            {saveMode === "confirmed" && (
              <Text style={{ color: c.mutedForeground, textAlign: "center" }}>
                Stock has been updated and a journal entry was posted.
              </Text>
            )}
            {costChanges.length > 0 && (
              <View style={{ width: "100%", padding: 12, backgroundColor: "#f59e0b22", borderRadius: 8, borderWidth: 1, borderColor: "#f59e0b66", gap: 6 }}>
                <Text style={{ color: "#f59e0b", fontFamily: fontFamily("semibold") }}>Cost prices updated:</Text>
                {costChanges.map((cc) => (
                  <Text key={cc.productId} style={{ color: c.mutedForeground, fontSize: 13 }}>
                    {cc.productName}: {fmtCurrency(cc.oldCost ?? 0)} → {fmtCurrency(cc.newCost)}
                  </Text>
                ))}
              </View>
            )}
            <Button label="Close" icon="check" onPress={handleClose} />
          </ScrollView>
        ) : step === "header" ? (
          /* ── Step 1: Header ── */
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, maxWidth: lay.contentMaxWidth, width: "100%", alignSelf: "center", paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
              <Field label="Bill / Invoice Number *" value={billNumber} onChangeText={setBillNumber} placeholder="e.g. INV-2024-001" autoFocus />
              <Field label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Supplier name (optional)" />
              <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional notes" multiline />
              <View style={{ gap: 6 }}>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>Tax Mode</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Chip label="Tax Exclusive" active={taxMode === "exclusive"} onPress={() => setTaxMode("exclusive")} />
                  <Chip label="Tax Inclusive" active={taxMode === "inclusive"} onPress={() => setTaxMode("inclusive")} />
                </View>
              </View>
              <Field
                label="Default Tax Rate (%)"
                value={defaultTaxRate}
                onChangeText={setDefaultTaxRate}
                placeholder="0"
                keyboardType="decimal-pad"
              />
              <Button
                label="Next: Add Items"
                icon="arrow-right"
                onPress={() => {
                  if (!billNumber.trim()) {
                    Alert.alert("Bill number required");
                    return;
                  }
                  setStep("items");
                }}
              />
            </ScrollView>
          </KeyboardAvoidingView>
        ) : step === "items" ? (
          /* ── Step 2: Items ── */
          <>
            <FlatList
              data={lines}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, paddingBottom: 120, maxWidth: lay.contentMaxWidth, width: "100%", alignSelf: "center" }}
              ListEmptyComponent={
                <EmptyState icon="shopping-bag" title="No items yet" subtitle="Tap the button below to add a product." />
              }
              renderItem={({ item: line, index }) => (
                <Card style={{ gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: c.foreground, fontFamily: fontFamily("medium"), flex: 1 }} numberOfLines={1}>
                      {line.productName}
                    </Text>
                    <Pressable hitSlop={8} onPress={() => setLines((ls) => ls.filter((_, i) => i !== index))}>
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Qty"
                        value={line.quantity}
                        onChangeText={(v) => setLines((ls) => ls.map((l, i) => i === index ? { ...l, quantity: v } : l))}
                        keyboardType="number-pad"
                        placeholder="1"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Unit Cost"
                        value={line.unitCost}
                        onChangeText={(v) => setLines((ls) => ls.map((l, i) => i === index ? { ...l, unitCost: v } : l))}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Tax %"
                        value={line.taxRate}
                        onChangeText={(v) => setLines((ls) => ls.map((l, i) => i === index ? { ...l, taxRate: v } : l))}
                        keyboardType="decimal-pad"
                        placeholder={defaultTaxRate}
                      />
                    </View>
                  </View>
                </Card>
              )}
            />

            {/* Footer buttons */}
            <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom, padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
              <Button label="Add Product" icon="plus" variant="secondary" onPress={() => { setItemSearch(""); setAddItemOpen(true); }} />
              <Button
                label="Next: Review"
                icon="arrow-right"
                onPress={() => {
                  if (lines.length === 0) { Alert.alert("Add at least one item"); return; }
                  setStep("review");
                }}
              />
            </View>

            {/* Product picker modal */}
            <Modal visible={addItemOpen} transparent animationType="fade" onRequestClose={() => setAddItemOpen(false)}>
              <Pressable
                onPress={() => setAddItemOpen(false)}
                style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
              >
                <Pressable onPress={() => {}} style={{ backgroundColor: c.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "75%", paddingTop: 16, paddingBottom: insets.bottom + 16 }}>
                  <Text style={{ color: c.foreground, fontSize: 17, fontFamily: fontFamily("bold"), paddingHorizontal: 16, marginBottom: 12 }}>
                    Select Product
                  </Text>
                  <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
                    <SearchBar value={itemSearch} onChangeText={setItemSearch} placeholder="Search product…" autoFocus />
                  </View>
                  <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 2 }}>
                    {filteredProducts.length === 0 ? (
                      <Text style={{ color: c.mutedForeground, textAlign: "center", paddingVertical: 24 }}>No products found</Text>
                    ) : (
                      filteredProducts.map((p) => (
                        <Pressable
                          key={p.id}
                          onPress={() => {
                            setLines((ls) => [
                              ...ls,
                              {
                                productId: p.id,
                                productName: p.name ?? String(p.id),
                                quantity: "1",
                                unitCost: String(p.costPrice ?? ""),
                                taxRate: defaultTaxRate,
                              },
                            ]);
                            setAddItemOpen(false);
                            setItemSearch("");
                          }}
                          style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}
                        >
                          <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{p.name}</Text>
                          <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                            {p.category ?? ""}
                            {p.costPrice ? ` · Last cost: ${fmtCurrency(p.costPrice)}` : ""}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>
          </>
        ) : (
          /* ── Step 3: Review ── */
          <>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 130, maxWidth: lay.contentMaxWidth, width: "100%", alignSelf: "center" }}>
              <Card style={{ gap: 8 }}>
                <Row label="Bill Number" value={billNumber} />
                {supplier ? <Row label="Supplier" value={supplier} /> : null}
                <Row label="Tax Mode" value={taxMode === "inclusive" ? "Inclusive" : "Exclusive"} />
                {Number(defaultTaxRate) > 0 && <Row label="Default Tax" value={`${defaultTaxRate}%`} />}
              </Card>

              <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 15 }}>
                {lines.length} Item{lines.length !== 1 ? "s" : ""}
              </Text>

              {lines.map((line, i) => {
                const qty = parseInt(line.quantity, 10) || 0;
                const cost = parseFloat(line.unitCost) || 0;
                return (
                  <Card key={i} style={{ gap: 4 }}>
                    <Text style={{ color: c.foreground, fontFamily: fontFamily("medium") }}>{line.productName}</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: c.mutedForeground, fontSize: 12 }}>
                        {qty} × {fmtCurrency(cost)}{Number(line.taxRate) > 0 ? ` + ${line.taxRate}% tax` : ""}
                      </Text>
                      <Text style={{ color: c.foreground, fontFamily: fontFamily("semibold"), fontSize: 13 }}>
                        {fmtCurrency(qty * cost)}
                      </Text>
                    </View>
                  </Card>
                );
              })}

              <Card style={{ gap: 8 }}>
                <Row label="Subtotal" value={fmtCurrency(subtotal)} />
                <Divider />
                <Row label="Total Cost (excl. tax)" value={fmtCurrency(subtotal)} bold />
              </Card>

              <View style={{ gap: 6 }}>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: fontFamily("medium") }}>Save as</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Chip label="Draft" active={saveMode === "draft"} onPress={() => setSaveMode("draft")} />
                  <Chip label="Confirm now" active={saveMode === "confirmed"} onPress={() => setSaveMode("confirmed")} />
                </View>
                {saveMode === "confirmed" && (
                  <Text style={{ color: "#f59e0b", fontSize: 12, marginTop: 2 }}>
                    Confirming will update stock and post a journal entry immediately.
                  </Text>
                )}
              </View>
            </ScrollView>

            <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom, padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.background }}>
              <Button label="← Back to Items" variant="secondary" onPress={() => setStep("items")} />
              <Button
                label={saveMode === "confirmed" ? "Confirm & Update Stock" : "Save as Draft"}
                icon={saveMode === "confirmed" ? "check-circle" : "save"}
                onPress={() => save.mutate()}
                loading={save.isPending}
              />
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}
