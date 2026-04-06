import { useState } from "react";
import { useListTables, useCreateTable, useUpdateTable, useDeleteTable } from "@workspace/api-client-react";
import type { DiningTable } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, UtensilsCrossed, Users, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

const TABLE_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  occupied: { label: "Occupied", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  reserved: { label: "Reserved", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
};

function TableCard({ table, onEdit, onDelete, onFree }: { table: DiningTable; onEdit: (t: DiningTable) => void; onDelete: (id: number) => void; onFree: (id: number) => void }) {
  const statusMeta = STATUS_LABELS[table.status] ?? STATUS_LABELS.available;
  const isOccupied = table.status !== "available";
  return (
    <div
      className="relative rounded-xl border border-border bg-card p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow"
      style={{ borderTop: `3px solid ${table.color}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-base">{table.name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Users className="h-3 w-3" /> {table.capacity} seats
          </p>
        </div>
        <Badge variant="outline" className={cn("text-xs", statusMeta.className)}>
          {statusMeta.label}
        </Badge>
      </div>
      {(table.currentOrderNumber || table.currentOrderId) && (
        <p className="text-xs text-muted-foreground font-mono">
          Order {table.currentOrderNumber ?? `#${table.currentOrderId}`}
        </p>
      )}
      {isOccupied && (
        <Button
          size="sm"
          className="h-8 text-xs w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          onClick={() => onFree(table.id)}
        >
          <Unlock className="h-3 w-3 mr-1" /> Free Table
        </Button>
      )}
      <div className="flex gap-2 mt-auto pt-2 border-t border-border">
        <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => onEdit(table)}>
          <Edit2 className="h-3 w-3 mr-1" /> Edit
        </Button>
        <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(table.id)}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );
}

interface TableForm {
  name: string;
  capacity: number;
  color: string;
  status?: string;
}

function TableDialog({
  open,
  table,
  onClose,
  onSave,
}: {
  open: boolean;
  table: DiningTable | null;
  onClose: () => void;
  onSave: (data: TableForm) => void;
}) {
  const [form, setForm] = useState<TableForm>(() => ({
    name: table?.name ?? "",
    capacity: table?.capacity ?? 2,
    color: table?.color ?? TABLE_COLORS[0],
    status: table?.status ?? "available",
  }));

  const handleOpen = () => {
    setForm({
      name: table?.name ?? "",
      capacity: table?.capacity ?? 2,
      color: table?.color ?? TABLE_COLORS[0],
      status: table?.status ?? "available",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{table ? "Edit Table" : "Add Table"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Table Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Table 1, Booth A…"
            />
          </div>
          <div className="space-y-1">
            <Label>Capacity</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
            />
          </div>
          {table && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="reserved">Reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {TABLE_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn("h-7 w-7 rounded-full border-2 transition-all", form.color === c ? "border-white scale-110" : "border-transparent")}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Tables() {
  const { data: tables, isLoading } = useListTables();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const deleteTable = useDeleteTable();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/tables"] });

  const handleSave = (data: TableForm) => {
    if (editingTable) {
      updateTable.mutate(
        { id: editingTable.id, data },
        {
          onSuccess: () => { toast({ title: "Table updated" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Error", description: "Could not update table", variant: "destructive" }),
        },
      );
    } else {
      createTable.mutate(
        { data: { name: data.name, capacity: data.capacity, color: data.color } },
        {
          onSuccess: () => { toast({ title: "Table created" }); invalidate(); setDialogOpen(false); },
          onError: () => toast({ title: "Error", description: "Could not create table", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = (id: number) => {
    deleteTable.mutate(
      { id },
      {
        onSuccess: () => { toast({ title: "Table removed" }); invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not delete table", variant: "destructive" }),
      },
    );
  };

  const handleFreeTable = (id: number) => {
    updateTable.mutate(
      { id, data: { status: "available", currentOrderId: null } },
      {
        onSuccess: () => { toast({ title: "Table freed", description: "Table is now available." }); invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not free table", variant: "destructive" }),
      },
    );
  };

  const available = tables?.filter((t) => t.status === "available").length ?? 0;
  const occupied = tables?.filter((t) => t.status === "occupied").length ?? 0;
  const reserved = tables?.filter((t) => t.status === "reserved").length ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Floor Plan</h1>
            <p className="text-xs text-muted-foreground">Restaurant Table Management</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-xs">
            <span className="text-emerald-400 font-medium">{available} Available</span>
            <span className="text-blue-400 font-medium">{occupied} Occupied</span>
            <span className="text-amber-400 font-medium">{reserved} Reserved</span>
          </div>
          <Button
            size="sm"
            onClick={() => { setEditingTable(null); setDialogOpen(true); }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Table
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading tables…</div>
        ) : !tables?.length ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-muted-foreground">
            <UtensilsCrossed className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium">No tables configured</p>
              <p className="text-sm mt-1">Add tables to enable restaurant mode</p>
            </div>
            <Button onClick={() => { setEditingTable(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Your First Table
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                onEdit={(t) => { setEditingTable(t); setDialogOpen(true); }}
                onDelete={handleDelete}
                onFree={handleFreeTable}
              />
            ))}
          </div>
        )}
      </div>

      <TableDialog
        open={dialogOpen}
        table={editingTable}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
