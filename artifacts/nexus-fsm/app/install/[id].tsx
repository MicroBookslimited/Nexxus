/**
 * Universal Installation Work Order — technician form.
 *
 * Renders the shared INSTALL_SECTIONS definition dynamically: only the
 * sections for the selected service areas appear, and fields progressively
 * reveal based on earlier answers (showIf). Each section saves independently.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  INSTALL_SECTIONS,
  SERVICE_AREAS,
  installFieldVisible,
  installSectionProgress,
  visibleInstallSections,
  type InstallField,
  type InstallSection,
  type InstallTableColumn,
} from '@workspace/api-client-react';
import { ScannerModal, isScannableField } from '@/components/ScannerModal';
import { useStaff } from '@/context/StaffContext';
import { useColors } from '@/hooks/useColors';
import { getJob, patchInstallDetails, type InstallDetailsMap } from '@/lib/fsm-api';

type SectionData = Record<string, unknown>;
type Row = Record<string, unknown>;

function notify(kind: 'success' | 'error') {
  if (Platform.OS !== 'web') {
    void Haptics.notificationAsync(
      kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    );
  }
}

export default function InstallFormScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = parseInt(String(idParam), 10);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { staff } = useStaff();
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ['fsm-job', staff?.id, id],
    queryFn: () => getJob(staff!.id, id),
    enabled: !!staff && Number.isInteger(id),
  });

  const [areas, setAreas] = useState<string[]>([]);
  const [details, setDetails] = useState<InstallDetailsMap>({});
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (job && !hydrated) {
      setAreas(job.serviceAreas ?? []);
      setDetails(job.installDetails ?? {});
      setHydrated(true);
    }
  }, [job, hydrated]);

  const saveMutation = useMutation({
    mutationFn: (body: { serviceAreas?: string[]; installDetails?: InstallDetailsMap }) =>
      patchInstallDetails(staff!.id, id, body),
    onSuccess: (res) => {
      qc.setQueryData(['fsm-job', staff?.id, id], (old: unknown) =>
        old ? { ...(old as object), serviceAreas: res.serviceAreas, installDetails: res.installDetails } : old);
      void qc.invalidateQueries({ queryKey: ['fsm-jobs'] });
      notify('success');
    },
    onError: () => notify('error'),
  });

  const toggleArea = (areaId: string) => {
    const next = areas.includes(areaId) ? areas.filter((a) => a !== areaId) : [...areas, areaId];
    setAreas(next);
    saveMutation.mutate({ serviceAreas: next });
  };

  const setField = (sectionId: string, fieldId: string, value: unknown) => {
    setDetails((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] ?? {}), [fieldId]: value } }));
    setDirty((prev) => new Set(prev).add(sectionId));
  };

  const saveSection = (sectionId: string) => {
    saveMutation.mutate(
      { installDetails: { [sectionId]: (details[sectionId] ?? {}) as Record<string, unknown> } },
      { onSuccess: () => setDirty((prev) => { const n = new Set(prev); n.delete(sectionId); return n; }) },
    );
  };

  // Locked once the job is closed OR the customer has signed off on the work.
  // Also locked BEFORE work is started in the app (Arrive on Site) so the
  // technician can't log work they haven't officially begun.
  const notStarted = job ? !job.arrivedAt : false;
  const readOnly = job
    ? job.status === 'collected' || job.status === 'cancelled' ||
      !!job.completionSignature || !!job.customerSignature || notStarted
    : false;
  const sections = visibleInstallSections(areas);

  if (isLoading || !job) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Installation Form</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{job.workOrderNumber}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
        {notStarted ? (
          <View style={[styles.areaChip, { backgroundColor: colors.warning + '22', borderColor: colors.warning, borderWidth: 1, marginBottom: 12, alignSelf: 'stretch' }]}>
            <Text style={[styles.hint, { color: colors.warning, marginTop: 0 }]}>
              Start work first — tap "Arrive on Site" on the job screen to unlock this form.
            </Text>
          </View>
        ) : null}
        {/* Service areas */}
        <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>SERVICE AREAS ON THIS JOB</Text>
        <View style={styles.areaWrap}>
          {SERVICE_AREAS.map((a) => {
            const on = areas.includes(a.id);
            return (
              <Pressable
                key={a.id}
                disabled={readOnly}
                onPress={() => toggleArea(a.id)}
                style={[
                  styles.areaChip,
                  on
                    ? { backgroundColor: colors.primary }
                    : { borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.areaChipText, { color: on ? '#04121C' : colors.foreground }]}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>
          Only the sections for the selected areas are shown below.
        </Text>

        {/* Sections */}
        {sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            data={(details[section.id] ?? {}) as SectionData}
            open={openSection === section.id}
            onToggle={() => setOpenSection(openSection === section.id ? null : section.id)}
            onChange={(fieldId, v) => setField(section.id, fieldId, v)}
            onSave={() => saveSection(section.id)}
            isDirty={dirty.has(section.id)}
            saving={saveMutation.isPending}
            readOnly={readOnly}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/* ── Section accordion ─────────────────────────────────────────────────────── */

function SectionCard({ section, data, open, onToggle, onChange, onSave, isDirty, saving, readOnly }: {
  section: InstallSection;
  data: SectionData;
  open: boolean;
  onToggle: () => void;
  onChange: (fieldId: string, value: unknown) => void;
  onSave: () => void;
  isDirty: boolean;
  saving: boolean;
  readOnly: boolean;
}) {
  const colors = useColors();
  const progress = installSectionProgress(section, data);
  const started = progress.done > 0;

  return (
    <View style={[styles.sectionCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Pressable onPress={onToggle} style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
          {section.description ? (
            <Text style={[styles.sectionDesc, { color: colors.mutedForeground }]}>{section.description}</Text>
          ) : null}
        </View>
        <View style={[styles.progressChip, { backgroundColor: started ? 'rgba(34,197,94,0.15)' : 'rgba(140,160,188,0.15)' }]}>
          <Text style={[styles.progressText, { color: started ? '#22C55E' : colors.mutedForeground }]}>
            {progress.done}/{progress.total}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
      </Pressable>

      {open && (
        <View style={styles.sectionBody}>
          {section.fields.map((f) =>
            installFieldVisible(f, data) ? (
              <FieldInput key={f.id} field={f} value={data[f.id]} onChange={(v) => onChange(f.id, v)} readOnly={readOnly} />
            ) : null,
          )}
          {!readOnly && (
            <Pressable
              onPress={onSave}
              disabled={!isDirty || saving}
              style={[styles.saveBtn, { backgroundColor: isDirty ? colors.primary : colors.border, opacity: saving ? 0.6 : 1 }]}
            >
              {saving && isDirty ? (
                <ActivityIndicator size="small" color="#04121C" />
              ) : (
                <Text style={[styles.saveBtnText, { color: isDirty ? '#04121C' : colors.mutedForeground }]}>
                  {isDirty ? 'Save section' : 'Saved'}
                </Text>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/* ── Field renderers ───────────────────────────────────────────────────────── */

function FieldInput({ field, value, onChange, readOnly }: {
  field: InstallField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const colors = useColors();

  switch (field.type) {
    case 'text':
    case 'number':
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <ScannableTextInput
            scannable={field.type === 'text' && !readOnly && isScannableField(field.id, field.label)}
            onScanned={(code) => onChange(code)}
            editable={!readOnly}
            value={value == null ? '' : String(value)}
            onChangeText={(t) => onChange(field.type === 'number' ? (t === '' ? null : Number(t.replace(/[^0-9.]/g, '')) || 0) : t)}
            placeholder={field.placeholder}
            placeholderTextColor={colors.mutedForeground}
            keyboardType={field.type === 'number' ? 'numeric' : 'default'}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          {field.help ? <Text style={[styles.help, { color: colors.mutedForeground }]}>{field.help}</Text> : null}
        </View>
      );

    case 'textarea':
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <TextInput
            editable={!readOnly}
            value={value == null ? '' : String(value)}
            onChangeText={onChange}
            placeholder={field.placeholder}
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[styles.input, styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          />
          {field.help ? <Text style={[styles.help, { color: colors.mutedForeground }]}>{field.help}</Text> : null}
        </View>
      );

    case 'yesno':
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <View style={styles.optionRow}>
            {[true, false].map((v) => {
              const on = value === v;
              return (
                <Pressable
                  key={String(v)}
                  disabled={readOnly}
                  onPress={() => onChange(on ? null : v)}
                  style={[styles.optionChip, on ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={[styles.optionText, { color: on ? '#04121C' : colors.foreground }]}>{v ? 'Yes' : 'No'}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );

    case 'radio':
    case 'select':
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          <View style={styles.optionRowWrap}>
            {(field.options ?? []).map((opt) => {
              const on = value === opt;
              return (
                <Pressable
                  key={opt}
                  disabled={readOnly}
                  onPress={() => onChange(on ? null : opt)}
                  style={[styles.optionChip, on ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={[styles.optionText, { color: on ? '#04121C' : colors.foreground }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
          {field.help ? <Text style={[styles.help, { color: colors.mutedForeground }]}>{field.help}</Text> : null}
        </View>
      );

    case 'checklist': {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          {(field.items ?? []).map((item) => {
            const on = checked.includes(item.id);
            return (
              <Pressable
                key={item.id}
                disabled={readOnly}
                onPress={() => onChange(on ? checked.filter((c) => c !== item.id) : [...checked, item.id])}
                style={styles.checkRow}
              >
                <Feather name={on ? 'check-square' : 'square'} size={18} color={on ? '#22C55E' : colors.mutedForeground} />
                <Text style={[styles.checkLabel, { color: colors.foreground }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    case 'table': {
      const rows: Row[] = Array.isArray(value) ? (value as Row[]) : [];
      const cols = field.columns ?? [];
      return (
        <View style={styles.fieldWrap}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
          {rows.map((row, i) => (
            <View key={i} style={[styles.rowCard, { borderColor: colors.border }]}>
              <View style={styles.rowCardHeader}>
                <Text style={[styles.rowCardTitle, { color: colors.foreground }]}>
                  {field.rowLabel ?? 'Row'} {i + 1}
                </Text>
                {!readOnly && (
                  <Pressable hitSlop={10} onPress={() => onChange(rows.filter((_, j) => j !== i))}>
                    <Feather name="trash-2" size={16} color="#EF4444" />
                  </Pressable>
                )}
              </View>
              {cols.map((col) => (
                <TableCell
                  key={col.id}
                  col={col}
                  value={row[col.id]}
                  readOnly={readOnly}
                  onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [col.id]: v } : r)))}
                />
              ))}
            </View>
          ))}
          {!readOnly && (
            <Pressable onPress={() => onChange([...rows, {}])} style={[styles.addRowBtn, { borderColor: colors.border }]}>
              <Feather name="plus" size={15} color={colors.primary} />
              <Text style={[styles.addRowText, { color: colors.primary }]}>Add {field.rowLabel ?? 'row'}</Text>
            </Pressable>
          )}
        </View>
      );
    }

    default:
      return null;
  }
}

function TableCell({ col, value, onChange, readOnly }: {
  col: InstallTableColumn;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  const colors = useColors();

  if (col.type === 'yesno') {
    const on = value === true;
    return (
      <Pressable disabled={readOnly} onPress={() => onChange(!on)} style={styles.checkRow}>
        <Feather name={on ? 'check-square' : 'square'} size={17} color={on ? '#22C55E' : colors.mutedForeground} />
        <Text style={[styles.checkLabel, { color: colors.foreground }]}>{col.label}</Text>
      </Pressable>
    );
  }

  if (col.type === 'select') {
    return (
      <View style={styles.cellWrap}>
        <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>{col.label}</Text>
        <View style={styles.optionRowWrap}>
          {(col.options ?? []).map((opt) => {
            const on = value === opt;
            return (
              <Pressable
                key={opt}
                disabled={readOnly}
                onPress={() => onChange(on ? null : opt)}
                style={[styles.optionChipSm, on ? { backgroundColor: colors.primary } : { borderWidth: 1, borderColor: colors.border }]}
              >
                <Text style={[styles.optionTextSm, { color: on ? '#04121C' : colors.foreground }]}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cellWrap}>
      <Text style={[styles.cellLabel, { color: colors.mutedForeground }]}>{col.label}</Text>
      <ScannableTextInput
        scannable={col.type !== 'number' && !readOnly && isScannableField(col.id, col.label)}
        onScanned={(code) => onChange(code)}
        editable={!readOnly}
        value={value == null ? '' : String(value)}
        onChangeText={(t) => onChange(col.type === 'number' ? (t === '' ? null : Number(t.replace(/[^0-9.]/g, '')) || 0) : t)}
        keyboardType={col.type === 'number' ? 'numeric' : 'default'}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, styles.cellInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
      />
    </View>
  );
}

/**
 * TextInput that grows a camera button when the field looks like a
 * serial / IMEI / barcode / asset-tag / MAC field. Scanning fills the field.
 */
function ScannableTextInput({
  scannable,
  onScanned,
  style,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & {
  scannable: boolean;
  onScanned: (code: string) => void;
}) {
  const colors = useColors();
  const [scanOpen, setScanOpen] = useState(false);

  if (!scannable) return <TextInput style={style} {...inputProps} />;

  return (
    <View style={styles.scanRow}>
      <TextInput style={[style, { flex: 1 }]} {...inputProps} />
      <Pressable
        onPress={() => setScanOpen(true)}
        hitSlop={8}
        style={[styles.scanBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
      >
        <Feather name="camera" size={18} color={colors.primary} />
      </Pressable>
      {/* Mount lazily so a table with many rows never holds idle camera instances. */}
      {scanOpen && (
        <ScannerModal
          visible
          onClose={() => setScanOpen(false)}
          onScan={onScanned}
          hint="Point at the serial / barcode label"
        />
      )}
    </View>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  headerSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  groupLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 8 },
  areaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  areaChipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 8, marginBottom: 16 },
  sectionCard: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sectionDesc: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 },
  progressChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  progressText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14 },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontFamily: 'Inter_400Regular' },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  help: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4, fontStyle: 'italic' },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optionChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  optionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  optionChipSm: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  optionTextSm: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  rowCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rowCardTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10 },
  addRowText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  cellWrap: { marginBottom: 8 },
  cellLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  cellInput: { paddingVertical: 7, fontSize: 13 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanBtn: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 11, marginTop: 4 },
  saveBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
