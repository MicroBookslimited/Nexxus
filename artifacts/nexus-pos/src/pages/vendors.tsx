import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListVendors, useCreateVendor, useUpdateVendor, useDeleteVendor,
  type Vendor,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Pencil, Trash2, Truck, Phone, Mail, MapPin, User } from "lucide-react";

const EMPTY: Partial<Vendor> = { name: "", contactName: "", phone: "", email: "", address: "", notes: "" };

export function Vendors() {
  const { data: vendors = [], isLoading } = useListVendors();
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Vendor> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = useMemo(() =>
    vendors.filter(v =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.contactName || "").toLowerCase().includes(search.toLowerCase()) ||
      (v.phone || "").includes(search) ||
      (v.email || "").toLowerCase().includes(search.toLowerCase())
    ), [vendors, search]);

  function openNew() {
    setEditing({ ...EMPTY });
    setIsNew(true);
    setEditOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing({ ...v });
    setIsNew(false);
    setEditOpen(true);
  }

  async function handleSave() {
    if (!editing?.name?.trim()) {
      toast({ title: "Vendor name is required", variant: "destructive" });
      return;
    }
    try {
      if (isNew) {
        await createVendor.mutateAsync(editing);
        toast({ title: "Vendor added" });
      } else {
        await updateVendor.mutateAsync({ id: editing.id!, data: editing });
        toast({ title: "Vendor updated" });
      }
      setEditOpen(false);
    } catch {
      toast({ title: "Failed to save vendor", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deleteVendor.mutateAsync(deleteId);
      toast({ title: "Vendor removed" });
    } catch {
      toast({ title: "Failed to delete vendor", variant: "destructive" });
    }
    setDeleteId(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 sm:px-6 py-4 border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 bg-secondary/40 border-border"
          />
        </div>
        <Button size="sm" onClick={openNew} className="gap-1.5 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Loading vendors…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Truck className="h-12 w-12 opacity-20" />
            <p className="text-sm">{search ? "No vendors match your search." : "No vendors yet. Add your first vendor."}</p>
            {!search && <Button size="sm" onClick={openNew} variant="outline">Add Vendor</Button>}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence initial={false}>
              {filtered.map(v => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card className="bg-secondary/30 border-border hover:bg-secondary/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                            <Truck className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{v.name}</p>
                            {v.contactName && (
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <User className="h-3 w-3 shrink-0" />{v.contactName}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(v)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(v.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        {v.phone && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{v.phone}</span>
                          </div>
                        )}
                        {v.email && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{v.email}</span>
                          </div>
                        )}
                        {v.address && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{v.address}</span>
                          </div>
                        )}
                        {v.notes && (
                          <p className="text-xs text-muted-foreground/70 italic mt-1 line-clamp-2">{v.notes}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Edit / Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Vendor" : "Edit Vendor"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label>Vendor Name <span className="text-destructive">*</span></Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={e => setEditing(p => ({ ...p!, name: e.target.value }))}
                  placeholder="e.g. Jamaica Farms Ltd"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Contact Person</Label>
                <Input
                  value={editing.contactName ?? ""}
                  onChange={e => setEditing(p => ({ ...p!, contactName: e.target.value }))}
                  placeholder="Full name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editing.phone ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, phone: e.target.value }))}
                    placeholder="876-xxx-xxxx"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input
                    value={editing.email ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, email: e.target.value }))}
                    placeholder="email@vendor.com"
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Address</Label>
                <Input
                  value={editing.address ?? ""}
                  onChange={e => setEditing(p => ({ ...p!, address: e.target.value }))}
                  placeholder="Street, Parish"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Notes</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={e => setEditing(p => ({ ...p!, notes: e.target.value }))}
                  placeholder="Payment terms, delivery days…"
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createVendor.isPending || updateVendor.isPending}>
              {isNew ? "Add Vendor" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Vendor?</AlertDialogTitle>
            <AlertDialogDescription>This vendor will be marked inactive. Existing purchases will be preserved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
