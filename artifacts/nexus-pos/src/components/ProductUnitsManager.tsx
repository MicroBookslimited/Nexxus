/**
 * Shared, tenant-wide catalog of reusable unit definitions (name + base unit
 * + conversion factor). Surfaced as the "Units" tab under the Products page.
 * The same catalog backs the dropdown in the per-product Pricing & Units
 * editor. Per-product `product_purchase_units` rows are unaffected by changes
 * here — this is just a reusable list of presets.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProductUnits,
  useCreateProductUnit,
  useUpdateProductUnit,
  useDeleteProductUnit,
  getListProductUnitsQueryKey,
  type ProductUnit,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Ruler, Save, X, Pencil } from "lucide-react";

type DraftRow = { name: string; baseUnit: string; conversionFactor: string };

const emptyDraft: DraftRow = { name: "", baseUnit: "each", conversionFactor: "" };

export function ProductUnitsManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const unitsQ = useListProductUnits();
  const createUnit = useCreateProductUnit();
  const updateUnit = useUpdateProductUnit();
  const deleteUnit = useDeleteProductUnit();

  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState<DraftRow>(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<DraftRow>(emptyDraft);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListProductUnitsQueryKey() });

  const validate = (d: DraftRow): string | null => {
    if (!d.name.trim()) return "Unit name is required";
    const cf = Number(d.conversionFactor);
    if (!Number.isFinite(cf) || cf <= 0) return "Conversion must be a positive number";
    return null;
  };

  const submitNew = () => {
    const err = validate(newRow);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    createUnit.mutate(
      { data: { name: newRow.name.trim(), baseUnit: newRow.baseUnit.trim() || "each", conversionFactor: Number(newRow.conversionFactor) } },
      {
        onSuccess: () => { invalidate(); setAdding(false); setNewRow(emptyDraft); toast({ title: "Unit added" }); },
        onError: (e: unknown) => toast({ title: "Could not add unit", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
      },
    );
  };

  const startEdit = (u: ProductUnit) => {
    setEditingId(u.id);
    setEditRow({ name: u.name, baseUnit: u.baseUnit, conversionFactor: String(u.conversionFactor) });
  };

  const submitEdit = (id: number) => {
    const err = validate(editRow);
    if (err) { toast({ title: err, variant: "destructive" }); return; }
    updateUnit.mutate(
      { id, data: { name: editRow.name.trim(), baseUnit: editRow.baseUnit.trim() || "each", conversionFactor: Number(editRow.conversionFactor) } },
      {
        onSuccess: () => { invalidate(); setEditingId(null); toast({ title: "Unit updated" }); },
        onError: (e: unknown) => toast({ title: "Could not update unit", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
      },
    );
  };

  const remove = (u: ProductUnit) => {
    if (!confirm(`Delete the saved unit "${u.name}"? Products already using it keep their own units.`)) return;
    deleteUnit.mutate(
      { id: u.id },
      {
        onSuccess: () => { invalidate(); toast({ title: "Unit deleted" }); },
        onError: (e: unknown) => toast({ title: "Could not delete unit", description: e instanceof Error ? e.message : String(e), variant: "destructive" }),
      },
    );
  };

  const units = unitsQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" /> Saved Units
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Reusable units you can pick when setting up a product's Pricing &amp; Units —
            e.g. <span className="font-mono">CS24</span> = 24, <span className="font-mono">CS12</span> = 12.
            Conversion is the number of base units in one of this unit.
          </p>
        </div>
        {canManage && !adding && (
          <Button onClick={() => { setAdding(true); setNewRow(emptyDraft); }} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> Add Unit
          </Button>
        )}
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit Name</TableHead>
              <TableHead>Base Unit</TableHead>
              <TableHead>Conversion (base units per unit)</TableHead>
              {canManage && <TableHead className="w-[120px] text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {adding && (
              <TableRow>
                <TableCell>
                  <Input autoFocus placeholder="e.g. CS24" value={newRow.name}
                    onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input placeholder="each" value={newRow.baseUnit}
                    onChange={(e) => setNewRow({ ...newRow, baseUnit: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Input type="number" min="0" step="0.01" placeholder="e.g. 24" value={newRow.conversionFactor}
                    onChange={(e) => setNewRow({ ...newRow, conversionFactor: e.target.value })} />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button size="icon" variant="ghost" className="text-primary" onClick={submitNew} disabled={createUnit.isPending}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setAdding(false); setNewRow(emptyDraft); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )}

            {units.length === 0 && !adding ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="text-center text-sm text-muted-foreground py-10">
                  No saved units yet. Add one here, or it'll be remembered automatically when you add a unit to a product.
                </TableCell>
              </TableRow>
            ) : (
              units.map((u) => (
                editingId === u.id ? (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Input value={editRow.name} onChange={(e) => setEditRow({ ...editRow, name: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input value={editRow.baseUnit} onChange={(e) => setEditRow({ ...editRow, baseUnit: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0" step="0.01" value={editRow.conversionFactor}
                        onChange={(e) => setEditRow({ ...editRow, conversionFactor: e.target.value })} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" className="text-primary" onClick={() => submitEdit(u.id)} disabled={updateUnit.isPending}>
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="font-mono text-sm">{u.baseUnit}</TableCell>
                    <TableCell className="font-mono text-sm">{u.conversionFactor}</TableCell>
                    {canManage && (
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => startEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => remove(u)} disabled={deleteUnit.isPending}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                )
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
