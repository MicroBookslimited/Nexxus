/**
 * Universal Installation Work Order — staff/dispatcher form (web POS).
 *
 * Renders the shared INSTALL_SECTIONS definition dynamically: staff pick
 * service areas, only the matching sections appear, and fields progressively
 * reveal based on earlier answers. Each section saves independently and
 * merges server-side, so partial saves never wipe technician answers.
 */
import { useEffect, useMemo, useState } from "react";
import {
  INSTALL_SECTIONS,
  useListProducts,
  SERVICE_AREAS,
  installFieldVisible,
  installSectionProgress,
  visibleInstallSections,
  type InstallField,
  type InstallSection,
  type InstallTableColumn,
  type WorkOrder,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

type SectionData = Record<string, unknown>;
type InstallDetailsMap = Record<string, Record<string, unknown>>;
type Row = Record<string, unknown>;

export function WorkOrderInstallForm({ wo, onPatch, readOnly }: {
  wo: WorkOrder;
  onPatch: (updates: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const [areas, setAreas] = useState<string[]>(wo.serviceAreas ?? []);
  const [details, setDetails] = useState<InstallDetailsMap>(
    (wo.installDetails ?? {}) as InstallDetailsMap,
  );
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  // Re-sync from server after a save round-trips (but keep local edits).
  useEffect(() => {
    setAreas(wo.serviceAreas ?? []);
    setDetails((prev) => {
      const server = (wo.installDetails ?? {}) as InstallDetailsMap;
      const merged = { ...server };
      for (const sid of dirty) if (prev[sid]) merged[sid] = prev[sid];
      return merged;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo.serviceAreas, wo.installDetails]);

  const toggleArea = (areaId: string) => {
    const next = areas.includes(areaId) ? areas.filter((a) => a !== areaId) : [...areas, areaId];
    setAreas(next);
    onPatch({ serviceAreas: next });
  };

  const setField = (sectionId: string, fieldId: string, value: unknown) => {
    setDetails((prev) => ({ ...prev, [sectionId]: { ...(prev[sectionId] ?? {}), [fieldId]: value } }));
    setDirty((prev) => new Set(prev).add(sectionId));
  };

  const saveSection = (sectionId: string) => {
    onPatch({ installDetails: { [sectionId]: details[sectionId] ?? {} } });
    setDirty((prev) => { const n = new Set(prev); n.delete(sectionId); return n; });
  };

  const sections = visibleInstallSections(areas);

  return (
    <div className="space-y-4">
      {/* Service area picker */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Service areas on this job
          </p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_AREAS.map((a) => {
              const on = areas.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggleArea(a.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-input text-foreground hover:bg-muted"
                  } ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Only the sections for the selected areas appear below. Technicians see the same form in the field app.
          </p>
        </CardContent>
      </Card>

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
          readOnly={!!readOnly}
        />
      ))}
    </div>
  );
}

/* ── Section accordion ─────────────────────────────────────────────────────── */

function SectionCard({ section, data, open, onToggle, onChange, onSave, isDirty, readOnly }: {
  section: InstallSection;
  data: SectionData;
  open: boolean;
  onToggle: () => void;
  onChange: (fieldId: string, value: unknown) => void;
  onSave: () => void;
  isDirty: boolean;
  readOnly: boolean;
}) {
  const progress = installSectionProgress(section, data);
  const started = progress.done > 0;

  return (
    <Card>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{section.title}</p>
          {section.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
          )}
        </div>
        <Badge variant={started ? "default" : "secondary"} className="shrink-0">
          {progress.done}/{progress.total}
        </Badge>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 space-y-4">
          {section.fields.map((f) =>
            installFieldVisible(f, data) ? (
              <FieldInput key={f.id} field={f} value={data[f.id]} onChange={(v) => onChange(f.id, v)} readOnly={readOnly} />
            ) : null,
          )}
          {!readOnly && (
            <Button size="sm" onClick={onSave} disabled={!isDirty}>
              {isDirty ? "Save section" : "Saved"}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ── Field renderers ───────────────────────────────────────────────────────── */

function FieldInput({ field, value, onChange, readOnly }: {
  field: InstallField;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly: boolean;
}) {
  switch (field.type) {
    case "text":
    case "number":
      return (
        <div>
          <FieldLabel field={field} />
          <Input
            disabled={readOnly}
            type={field.type === "number" ? "number" : "text"}
            value={value == null ? "" : String(value)}
            placeholder={field.placeholder}
            onChange={(e) =>
              onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
            }
          />
          {field.help && <p className="text-xs text-muted-foreground italic mt-1">{field.help}</p>}
        </div>
      );

    case "textarea":
      return (
        <div>
          <FieldLabel field={field} />
          <Textarea
            disabled={readOnly}
            rows={3}
            value={value == null ? "" : String(value)}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.help && <p className="text-xs text-muted-foreground italic mt-1">{field.help}</p>}
        </div>
      );

    case "yesno":
      return (
        <div>
          <FieldLabel field={field} />
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <OptionChip
                key={String(v)}
                label={v ? "Yes" : "No"}
                on={value === v}
                disabled={readOnly}
                onClick={() => onChange(value === v ? null : v)}
              />
            ))}
          </div>
        </div>
      );

    case "radio":
    case "select":
      return (
        <div>
          <FieldLabel field={field} />
          <div className="flex flex-wrap gap-1.5">
            {(field.options ?? []).map((opt) => (
              <OptionChip
                key={opt}
                label={opt}
                on={value === opt}
                disabled={readOnly}
                onClick={() => onChange(value === opt ? null : opt)}
              />
            ))}
          </div>
          {field.help && <p className="text-xs text-muted-foreground italic mt-1">{field.help}</p>}
        </div>
      );

    case "checklist": {
      const checked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          <FieldLabel field={field} />
          <div className="space-y-1.5">
            {(field.items ?? []).map((item) => {
              const on = checked.includes(item.id);
              return (
                <label key={item.id} className={`flex items-center gap-2 text-sm ${readOnly ? "opacity-60" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={on}
                    onChange={() => onChange(on ? checked.filter((c) => c !== item.id) : [...checked, item.id])}
                    className="h-4 w-4 accent-primary"
                  />
                  {item.label}
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case "table": {
      const rows: Row[] = Array.isArray(value) ? (value as Row[]) : [];
      const cols = field.columns ?? [];
      return (
        <div>
          <FieldLabel field={field} />
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{field.rowLabel ?? "Row"} {i + 1}</p>
                  {!readOnly && (
                    <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {cols.map((col) => (
                    <TableCell
                      key={col.id}
                      col={col}
                      value={row[col.id]}
                      row={row}
                      readOnly={readOnly}
                      onChange={(v) => onChange(rows.map((r, j) => (j === i ? { ...r, [col.id]: v } : r)))}
                      onPatchRow={(patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))}
                    />
                  ))}
                </div>
              </div>
            ))}
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={() => onChange([...rows, {}])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add {field.rowLabel ?? "row"}
              </Button>
            )}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/**
 * Free-text equipment cell with catalog search: picking a product links the
 * row (stores `${col.id}ProductId`) so completing the job deducts inventory;
 * typing freely clears the link (customer-supplied / non-catalog items).
 */
function ProductCell({ col, value, row, onPatchRow, readOnly }: {
  col: InstallTableColumn;
  value: unknown;
  row: Row;
  onPatchRow: (patch: Row) => void;
  readOnly: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const { data: products } = useListProducts();
  const text = value == null ? "" : String(value);
  const linkedId = row[`${col.id}ProductId`];
  const linked = typeof linkedId === "number" && linkedId > 0;

  const matches = useMemo(() => {
    if (!focused || linked) return [];
    const q = text.trim().toLowerCase();
    if (q.length < 2) return [];
    return (products ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [focused, linked, text, products]);

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground">{col.label}</p>
        {linked && (
          <span className="text-[10px] font-semibold text-emerald-600">In catalog — deducts stock</span>
        )}
      </div>
      <Input
        disabled={readOnly}
        className="h-8 text-sm"
        value={text}
        placeholder="Type name or pick from catalog"
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChange={(e) => onPatchRow({ [col.id]: e.target.value, [`${col.id}ProductId`]: null })}
      />
      {matches.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onPatchRow({ [col.id]: p.name, [`${col.id}ProductId`]: p.id });
                setFocused(false);
              }}
            >
              {p.name}
              <span className="text-xs text-muted-foreground ml-2">
                {p.stockCount != null ? `${p.stockCount} in stock` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ field }: { field: InstallField }) {
  return <p className="text-xs font-semibold text-muted-foreground mb-1.5">{field.label}</p>;
}

function OptionChip({ label, on, disabled, onClick }: {
  label: string; on: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
        on ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

function TableCell({ col, value, row, onChange, onPatchRow, readOnly }: {
  col: InstallTableColumn;
  value: unknown;
  row?: Row;
  onChange: (v: unknown) => void;
  onPatchRow?: (patch: Row) => void;
  readOnly: boolean;
}) {
  if (col.type === "product" && onPatchRow) {
    return <ProductCell col={col} value={value} row={row ?? {}} onPatchRow={onPatchRow} readOnly={readOnly} />;
  }

  if (col.type === "yesno") {
    const on = value === true;
    return (
      <label className={`flex items-center gap-2 text-sm ${readOnly ? "opacity-60" : "cursor-pointer"}`}>
        <input
          type="checkbox"
          disabled={readOnly}
          checked={on}
          onChange={() => onChange(!on)}
          className="h-4 w-4 accent-primary"
        />
        {col.label}
      </label>
    );
  }

  if (col.type === "select") {
    return (
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground mb-1">{col.label}</p>
        <div className="flex flex-wrap gap-1">
          {(col.options ?? []).map((opt) => (
            <OptionChip
              key={opt}
              label={opt}
              on={value === opt}
              disabled={readOnly}
              onClick={() => onChange(value === opt ? null : opt)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">{col.label}</p>
      <Input
        disabled={readOnly}
        type={col.type === "number" ? "number" : "text"}
        className="h-8 text-sm"
        value={value == null ? "" : String(value)}
        onChange={(e) =>
          onChange(col.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
        }
      />
    </div>
  );
}
