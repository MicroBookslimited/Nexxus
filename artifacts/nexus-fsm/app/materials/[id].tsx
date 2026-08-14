/**
 * Materials & Cable — field allocation screen.
 *
 * Shows everything the office dispatched to this job. Technicians log cable
 * runs (start/end footage per camera; length auto-computes) and record what
 * they returned. Admins/managers can additionally dispatch new materials
 * straight from the phone — inventory-linked items deduct stock.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import {
  createAllocation,
  getJob,
  isAdminRole,
  searchProducts,
  updateAllocation,
  type Allocation,
  type CableRun,
  type ProductLite,
} from '@/lib/fsm-api';

function notify(kind: 'success' | 'error') {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  }
}

export default function MaterialsScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(idParam), 10);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { staff } = useStaff();
  const qc = useQueryClient();
  const admin = isAdminRole(staff?.role);

  const { data: job, isLoading } = useQuery({
    queryKey: ['fsm-job', staff?.id, id],
    queryFn: () => getJob(staff!.id, id),
    enabled: !!staff && Number.isInteger(id),
  });

  const [openId, setOpenId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fsm-job', staff?.id, id] });
  };

  const patchMutation = useMutation({
    mutationFn: (v: { allocationId: number; body: Parameters<typeof updateAllocation>[3] }) =>
      updateAllocation(staff!.id, id, v.allocationId, v.body),
    onSuccess: () => { refresh(); notify('success'); },
    onError: () => notify('error'),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createAllocation>[2]) => createAllocation(staff!.id, id, body),
    onSuccess: () => { refresh(); setShowAdd(false); notify('success'); },
    onError: () => notify('error'),
  });

  const readOnly = job ? job.status === 'collected' || job.status === 'cancelled' : false;
  // After customer sign-off the job content is frozen (no new dispatches, no
  // cable-run edits) but returning tools/materials to stock stays allowed.
  // Cable-run logging is also locked until work is started (Arrive on Site).
  const signedOff = job ? !!(job.completionSignature || job.customerSignature) : false;
  const notStarted = job ? !job.arrivedAt : false;
  const allocations = job?.allocations ?? [];

  if (isLoading || !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Materials & Cable</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{job.workOrderNumber}</Text>
        </View>
        {admin && !readOnly && !signedOff && (
          <Pressable
            onPress={() => setShowAdd(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {allocations.length === 0 && (
          <View style={styles.empty}>
            <Feather name="package" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Nothing dispatched to this job yet.
            </Text>
          </View>
        )}
        {allocations.map((a) => (
          <AllocationCard
            key={a.id}
            a={a}
            colors={colors}
            open={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            readOnly={readOnly}
            contentLocked={signedOff || notStarted}
            allowDirectReturn={admin}
            saving={patchMutation.isPending}
            onPatch={(body) => patchMutation.mutate({ allocationId: a.id, body })}
          />
        ))}
      </ScrollView>

      {!readOnly && allocations.some((a) => a.qtyAllocated - a.qtyReturned > 0) ? (
        <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            testID="return-to-office-button"
            onPress={() => router.push(`/material-return?jobId=${id}`)}
            style={[styles.returnBtn, { backgroundColor: job.materialReturnPending ? colors.card : colors.primary, borderColor: colors.border }]}
          >
            <Feather
              name={job.materialReturnPending ? 'edit-3' : 'corner-up-left'}
              size={16}
              color={job.materialReturnPending ? colors.foreground : '#fff'}
            />
            <Text style={[styles.returnBtnText, { color: job.materialReturnPending ? colors.foreground : '#fff' }]}>
              {job.materialReturnPending ? 'Return waiting for signature' : 'Return to office'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {admin && (
        <AddAllocationModal
          visible={showAdd}
          onClose={() => setShowAdd(false)}
          onSubmit={(body) => createMutation.mutate(body)}
          pending={createMutation.isPending}
          colors={colors}
        />
      )}
    </View>
  );
}

/* ── Allocation card ───────────────────────────────────────────────────────── */

function AllocationCard({ a, colors, open, onToggle, readOnly, contentLocked, allowDirectReturn, saving, onPatch }: {
  a: Allocation;
  colors: ReturnType<typeof useColors>;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  /** Sign-off freeze: blocks run/remark edits but still allows returns. */
  contentLocked: boolean;
  /** Office staff can adjust returned quantities directly; technicians must
   * go through the signed return handover so nobody clears their own custody. */
  allowDirectReturn: boolean;
  saving: boolean;
  onPatch: (body: { qtyReturned?: number; runs?: CableRun[] }) => void;
}) {
  const usedFt = a.runs.reduce((s, r) => s + (r.lengthFt ?? 0), 0);
  const remainingFt = a.boxSizeFt != null ? a.boxSizeFt * a.qtyAllocated - usedFt : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable onPress={onToggle} style={styles.cardHead}>
        <Feather
          name={a.isCable ? 'git-branch' : 'package'}
          size={18}
          color={a.isCable ? colors.primary : colors.mutedForeground}
        />
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{a.description}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {a.qtyAllocated} {a.unit}
            {a.isCable && a.boxSizeFt != null ? ` · ${usedFt} ft used · ${remainingFt} ft left` : ''}
            {a.isReturnable ? (a.qtyReturned >= a.qtyAllocated ? ' · returned ✓' : ' · tool — return it') : ''}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>

      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          {a.isCable && (
            <RunLog key={`runs-${a.id}-${a.updatedAt}`} runs={a.runs} colors={colors} readOnly={readOnly || contentLocked} saving={saving} onSave={(runs) => onPatch({ runs })} />
          )}
          {!readOnly && (
            allowDirectReturn ? (
              <ReturnRow key={`ret-${a.id}-${a.updatedAt}`} a={a} colors={colors} onSave={(qtyReturned) => onPatch({ qtyReturned })} />
            ) : (
              <Text style={[styles.cardSub, { color: colors.mutedForeground, marginTop: 6 }]}>
                Returns are recorded through “Return to office” below — an authorised person signs for them.
              </Text>
            )
          )}
        </View>
      )}
    </View>
  );
}

function ReturnRow({ a, colors, onSave }: {
  a: Allocation;
  colors: ReturnType<typeof useColors>;
  onSave: (qty: number) => void;
}) {
  const [val, setVal] = useState(a.qtyReturned ? String(a.qtyReturned) : '');
  return (
    <View style={styles.returnRow}>
      <Text style={[styles.label, { color: colors.mutedForeground, flex: 1 }]}>Returned ({a.unit})</Text>
      <TextInput
        style={[styles.input, { color: colors.foreground, borderColor: colors.border, width: 80, textAlign: 'center' }]}
        value={val}
        onChangeText={setVal}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.mutedForeground}
      />
      <Pressable
        onPress={() => onSave(Math.max(0, Math.min(Number(val) || 0, a.qtyAllocated)))}
        style={[styles.smallBtn, { backgroundColor: colors.primary }]}
      >
        <Text style={styles.smallBtnText}>Save</Text>
      </Pressable>
    </View>
  );
}

/* ── Cable run log ─────────────────────────────────────────────────────────── */

function RunLog({ runs, colors, readOnly, saving, onSave }: {
  runs: CableRun[];
  colors: ReturnType<typeof useColors>;
  readOnly: boolean;
  saving: boolean;
  onSave: (runs: CableRun[]) => void;
}) {
  const [rows, setRows] = useState<CableRun[]>(runs);
  const [dirty, setDirty] = useState(false);

  const set = (i: number, patch: Partial<CableRun>) => {
    setRows((prev) => prev.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, ...patch };
      if (next.startFt != null && next.endFt != null && next.endFt >= next.startFt) {
        next.lengthFt = Math.round((next.endFt - next.startFt) * 100) / 100;
      }
      return next;
    }));
    setDirty(true);
  };

  const num = (v: string): number | null => (v.trim() === '' ? null : Number(v) || 0);
  const totalUsed = rows.reduce((s, r) => s + (r.lengthFt ?? 0), 0);

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={styles.runHeader}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>WIRE ALLOCATION LOG</Text>
        <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{totalUsed} ft used</Text>
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[styles.runCard, { borderColor: colors.border }]}>
          <View style={styles.runRow}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, flex: 1 }]}
              value={r.label}
              editable={!readOnly}
              onChangeText={(t) => set(i, { label: t })}
              placeholder="CAM-01"
              placeholderTextColor={colors.mutedForeground}
            />
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, flex: 1 }]}
              value={r.location ?? ''}
              editable={!readOnly}
              onChangeText={(t) => set(i, { location: t })}
              placeholder="Location"
              placeholderTextColor={colors.mutedForeground}
            />
            {!readOnly && (
              <Pressable onPress={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }} hitSlop={8}>
                <Feather name="trash-2" size={16} color={colors.destructive ?? '#dc2626'} />
              </Pressable>
            )}
          </View>
          <View style={styles.runRow}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, flex: 1 }]}
              value={r.startFt != null ? String(r.startFt) : ''}
              editable={!readOnly}
              onChangeText={(t) => set(i, { startFt: num(t) })}
              keyboardType="numeric"
              placeholder="Start ft"
              placeholderTextColor={colors.mutedForeground}
            />
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, flex: 1 }]}
              value={r.endFt != null ? String(r.endFt) : ''}
              editable={!readOnly}
              onChangeText={(t) => set(i, { endFt: num(t) })}
              keyboardType="numeric"
              placeholder="End ft"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.lenText, { color: colors.foreground }]}>
              {r.lengthFt != null ? `${r.lengthFt} ft` : '—'}
            </Text>
            <Pressable
              disabled={readOnly}
              onPress={() => set(i, { tested: r.tested === true ? false : true })}
              style={[styles.testBtn, {
                backgroundColor: r.tested ? (colors.primary ?? '#16a34a') : 'transparent',
                borderColor: colors.border,
              }]}
            >
              <Feather name="check" size={14} color={r.tested ? '#fff' : colors.mutedForeground} />
            </Pressable>
          </View>
        </View>
      ))}
      {!readOnly && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={() => { setRows([...rows, { label: `CAM-${String(rows.length + 1).padStart(2, '0')}` }]); setDirty(true); }}
            style={[styles.smallBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
          >
            <Text style={[styles.smallBtnText, { color: colors.foreground }]}>+ Add run</Text>
          </Pressable>
          <Pressable
            disabled={!dirty || saving}
            onPress={() => { onSave(rows); setDirty(false); }}
            style={[styles.smallBtn, { backgroundColor: dirty ? colors.primary : colors.border }]}
          >
            <Text style={styles.smallBtnText}>{saving ? 'Saving…' : dirty ? 'Save runs' : 'Saved'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/* ── Admin add-allocation modal ────────────────────────────────────────────── */

function AddAllocationModal({ visible, onClose, onSubmit, pending, colors }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (body: {
    productId?: number; description?: string; unit?: string; qtyAllocated: number;
    isCable?: boolean; isReturnable?: boolean; boxSizeFt?: number;
  }) => void;
  pending: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [search, setSearch] = useState('');
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [isCable, setIsCable] = useState(false);
  const [isReturnable, setIsReturnable] = useState(false);
  const [boxSizeFt, setBoxSizeFt] = useState('1000');

  const { data: matches } = useQuery({
    queryKey: ['fsm-product-search', search],
    queryFn: () => searchProducts(search),
    enabled: visible && search.trim().length >= 2 && !product,
  });

  const reset = () => {
    setSearch(''); setProduct(null); setDescription(''); setQty('1'); setUnit('pcs');
    setIsCable(false); setIsReturnable(false); setBoxSizeFt('1000');
  };

  const canSubmit = Number(qty) > 0 && (product != null || description.trim().length > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.modalHead}>
            <Text style={[styles.title, { color: colors.foreground }]}>Dispatch Material</Text>
            <Pressable onPress={() => { onClose(); reset(); }} hitSlop={12}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>From inventory (deducts stock)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              value={product ? product.name : search}
              onChangeText={(t) => { setSearch(t); setProduct(null); }}
              placeholder="Search products…"
              placeholderTextColor={colors.mutedForeground}
            />
            {!product && (matches ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => { setProduct(p); setDescription(p.name); }}
                style={[styles.matchRow, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, flex: 1 }} numberOfLines={1}>{p.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{p.stockCount ?? 0} in stock</Text>
              </Pressable>
            ))}
            {product && (
              <Pressable onPress={() => { setProduct(null); setDescription(''); }}>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textDecorationLine: 'underline', marginTop: 4 }}>
                  Clear — free-text item instead
                </Text>
              </Pressable>
            )}
            {!product && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Item description</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. 20mm PVC Strap"
                  placeholderTextColor={colors.mutedForeground}
                />
              </>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Qty</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  value={qty} onChangeText={setQty} keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Unit</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  value={unit} onChangeText={setUnit} placeholder="pcs / box / length"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Toggle
                label="Cable (track runs)"
                on={isCable}
                onPress={() => { setIsCable(!isCable); if (!isCable) setUnit('box'); }}
                colors={colors}
              />
              <Toggle label="Tool (return it)" on={isReturnable} onPress={() => setIsReturnable(!isReturnable)} colors={colors} />
            </View>
            {isCable && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Box size (ft)</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  value={boxSizeFt} onChangeText={setBoxSizeFt} keyboardType="numeric"
                />
              </>
            )}
          </ScrollView>
          <Pressable
            disabled={!canSubmit || pending}
            onPress={() => {
              onSubmit({
                productId: product?.id,
                description: description.trim() || undefined,
                unit: unit.trim() || 'pcs',
                qtyAllocated: Number(qty),
                isCable,
                isReturnable,
                boxSizeFt: isCable && Number(boxSizeFt) > 0 ? Number(boxSizeFt) : undefined,
              });
              reset();
            }}
            style={[styles.submitBtn, { backgroundColor: canSubmit ? colors.primary : colors.border }]}
          >
            <Text style={styles.smallBtnText}>{pending ? 'Dispatching…' : 'Dispatch'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Toggle({ label, on, onPress, colors }: {
  label: string; on: boolean; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.toggle, {
        backgroundColor: on ? colors.primary : 'transparent',
        borderColor: on ? colors.primary : colors.border,
      }]}
    >
      <Text style={{ color: on ? '#fff' : colors.foreground, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 1 },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: 12, marginBottom: 10 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  returnBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingVertical: 14,
  },
  returnBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  cardHead: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardSub: { fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  runHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  runCard: { borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 8, gap: 6 },
  runRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  lenText: { fontSize: 12, fontWeight: '700', width: 52, textAlign: 'center' },
  testBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  returnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 32 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  matchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, gap: 8 },
  toggle: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  submitBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
});
