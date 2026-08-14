import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListVendors, useCreateVendor, useUpdateVendor, useDeleteVendor,
  emailError, phoneError,
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

const EMPTY: Partial<Vendor> = { name: "", contactName: "", phone: "", email: "", address: "", city: "", state: "", postalCode: "", notes: "" };

type VendorErrors = { phone?: string; email?: string };

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
  const [touched, setTouched] = useState<{ phone?: boolean; email?: boolean }>({});

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
    setTouched({});
    setEditOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing({ ...v });
    setIsNew(false);
    setTouched({});
    setEditOpen(true);
  }

  function getErrors(): VendorErrors {
    const errs: VendorErrors = {};
    const ph = editing?.phone?.trim() ?? "";
    const em = editing?.email?.trim() ?? "";
    if (ph) { const e = phoneError(ph); if (e) errs.phone = e; }
    if (em) { const e = emailError(em); if (e) errs.email = e; }
    return errs;
  }

  async function handleSave() {
    if (!editing?.name?.trim()) {
      toast({ title: "Vendor name is required", variant: "destructive" });
      return;
    }
    setTouched({ phone: true, email: true });
    const errs = getErrors();
    if (errs.phone || errs.email) {
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
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

  const formErrors = getErrors();

  const vendorAddress = (v: Partial<Vendor>) =>
    [v.address, v.city, v.state, v.postalCode].filter(Boolean).join(", ");

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search vendors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Vendor
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Truck className="h-12 w-12 opacity-20" />
          <p className="text-sm">{search ? "No vendors match your search." : "No vendors yet. Add one to get started."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {filtered.map(v => (
              <motion.div key={v.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
                <Card className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-sm leading-tight">{v.name}</p>
                        {v.contactName && <p className="text-xs text-muted-foreground mt-0.5">{v.contactName}</p>}
                        {(v as { currentBalance?: number }).currentBalance != null && (v as { currentBalance: number }).currentBalance > 0 && (
                          <Badge variant="outline" className="mt-1 text-xs">
                            Balance: {(v as { currentBalance: number }).currentBalance.toLocaleString("en-JM", { style: "currency", currency: v.currency || "JMD" })}
                          </Badge>
                        )}
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
                          <Phone className="h-3 w-3 shrink-0" /><span>{v.phone}</span>
                        </div>
                      )}
                      {v.email && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{v.email}</span>
                        </div>
                      )}
                      {vendorAddress(v) && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{vendorAddress(v)}</span>
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

      {/* Edit / Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? "Add Vendor" : "Edit Vendor"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
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
                    onBlur={() => setTouched(t => ({ ...t, phone: true }))}
                    placeholder="876-xxx-xxxx"
                    className={touched.phone && formErrors.phone ? "border-destructive" : ""}
                  />
                  {touched.phone && formErrors.phone && (
                    <p className="text-xs text-destructive">{formErrors.phone}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editing.email ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, email: e.target.value }))}
                    onBlur={() => setTouched(t => ({ ...t, email: true }))}
                    placeholder="vendor@example.com"
                    className={touched.email && formErrors.email ? "border-destructive" : ""}
                  />
                  {touched.email && formErrors.email && (
                    <p className="text-xs text-destructive">{formErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Address — structured */}
              <div className="grid gap-1.5">
                <Label>Street / P.O. Box</Label>
                <Input
                  value={editing.address ?? ""}
                  onChange={e => setEditing(p => ({ ...p!, address: e.target.value }))}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5">
                  <Label>City / Town</Label>
                  <Input
                    value={(editing as Record<string, string>).city ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, city: e.target.value }))}
                    placeholder="Kingston"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Parish / State</Label>
                  <Input
                    value={(editing as Record<string, string>).state ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, state: e.target.value }))}
                    placeholder="St. Andrew"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Postal Code</Label>
                  <Input
                    value={(editing as Record<string, string>).postalCode ?? ""}
                    onChange={e => setEditing(p => ({ ...p!, postalCode: e.target.value }))}
                    placeholder="JMAAW03"
                  />
                </div>
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this vendor?</AlertDialogTitle>
            <AlertDialogDescription>This only removes the vendor record. Existing purchase orders and bills are not affected.</AlertDialogDescription>
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
