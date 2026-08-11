/**
 * Read-only summary of the installation form answers + materials used,
 * shown to the customer before they sign off on a job.
 *
 * Renders only the sections visible for the selected service areas and only
 * fields that actually have an answer, so the customer reviews exactly what
 * was recorded — nothing editable, nothing empty.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  INSTALL_SECTIONS,
  installFieldVisible,
  visibleInstallSections,
  type InstallField,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import type { Allocation, InstallDetailsMap } from '@/lib/fsm-api';

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function fieldValueText(field: InstallField, value: unknown): string {
  if (field.type === 'yesno') return value === true ? 'Yes' : value === false ? 'No' : '';
  if (field.type === 'checklist') {
    const checked = Array.isArray(value) ? (value as string[]) : [];
    return (field.items ?? []).filter((i) => checked.includes(i.id)).map((i) => i.label).join(', ');
  }
  return String(value ?? '');
}

export function InstallFormPreview({
  serviceAreas,
  installDetails,
  allocations,
}: {
  serviceAreas: string[];
  installDetails: InstallDetailsMap;
  allocations?: Allocation[];
}) {
  const colors = useColors();
  const sections = visibleInstallSections(serviceAreas ?? []);
  const usedMaterials = (allocations ?? []).filter((a) => a.qtyAllocated - a.qtyReturned > 0 || a.isCable);

  const renderedSections = sections
    .map((section) => {
      const data = (installDetails?.[section.id] ?? {}) as Record<string, unknown>;
      const rows: React.ReactNode[] = [];
      for (const field of section.fields) {
        if (!installFieldVisible(field, data)) continue;
        const value = data[field.id];
        if (!hasValue(value)) continue;

        if (field.type === 'table') {
          const tableRows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
          if (tableRows.length === 0) continue;
          rows.push(
            <View key={field.id} style={styles.fieldBlock}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
              {tableRows.map((row, i) => {
                const cells = (field.columns ?? [])
                  .filter((c) => hasValue(row[c.id]))
                  .map((c) => `${c.label}: ${c.type === 'yesno' ? (row[c.id] === true ? 'Yes' : 'No') : String(row[c.id])}`);
                if (cells.length === 0) return null;
                return (
                  <Text key={i} style={[styles.tableRow, { color: colors.foreground }]}>
                    {`${field.rowLabel ?? 'Row'} ${i + 1} — ${cells.join(' · ')}`}
                  </Text>
                );
              })}
            </View>,
          );
          continue;
        }

        const text = fieldValueText(field, value);
        if (!text) continue;
        rows.push(
          <View key={field.id} style={styles.fieldBlock}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{field.label}</Text>
            <Text style={[styles.fieldValue, { color: colors.foreground }]}>{text}</Text>
          </View>,
        );
      }
      if (rows.length === 0) return null;
      return (
        <View key={section.id} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>{section.title}</Text>
          {rows}
        </View>
      );
    })
    .filter(Boolean);

  if (renderedSections.length === 0 && usedMaterials.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.mutedForeground }]}>INSTALLATION FORM</Text>
      {renderedSections}
      {usedMaterials.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Materials Used</Text>
          {usedMaterials.map((a) => {
            const runFt = (a.runs ?? []).reduce((s, r) => s + (Number(r.lengthFt) || 0), 0);
            const qty = a.isCable && runFt > 0 ? `${runFt} ft` : `${a.qtyAllocated - a.qtyReturned} ${a.unit}`;
            return (
              <Text key={a.id} style={[styles.tableRow, { color: colors.foreground }]}>
                {`${qty} — ${a.description}`}
              </Text>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  heading: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, marginBottom: 4 },
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  fieldBlock: { marginBottom: 6 },
  fieldLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldValue: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  tableRow: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
});
