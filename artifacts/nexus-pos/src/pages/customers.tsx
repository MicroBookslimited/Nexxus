import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useGetCustomerOrders,
} from "@workspace/api-client-react";
import type { GetCustomerResponse } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Plus, Search, Pencil, Trash2, Users, Star, Phone, Mail, ShoppingBag } from "lucide-react";
import { format } from "date-fns";

type CustomerForm = { name: string; email: string; phone: string };
const emptyForm = (): CustomerForm => ({ name: "", email: "", phone: "" });

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function CustomerOrderHistory({ customerId }: { customerId: number }) {
  const { data: orders, isLoading } = useGetCustomerOrders({ id: customerId });

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!orders?.length) return <p className="text-sm text-muted-foreground py-4 text-center">No orders yet</p>;

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "MMM d, yyyy")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={order.status === "completed" ? "default" : "destructive"} className="text-xs capitalize">
              {order.status}
            </Badge>
            <span className="font-mono text-sm font-semibold text-primary">{formatCurrency(order.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useListCustomers(search ? { search } : {});
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<GetCustomerResponse | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<GetCustomerResponse | null>(null);

  const openAdd = () => {
    setEditingCustomer(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: GetCustomerResponse) => {
    setEditingCustomer(c);
    setForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
    };

    if (editingCustomer) {
      updateCustomer.mutate(
        { id: editingCustomer.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Customer updated" });
            queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        },
      );
    } else {
      createCustomer.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Customer created" });
            queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteCustomer.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Customer deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
          setDeleteId(null);
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground mt-1 text-sm">Manage your customer profiles and loyalty.</p>
        </div>
        <Button onClick={openAdd} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 w-full"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !customers?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Users className="h-12 w-12 opacity-30" />
          <p className="text-lg">No customers yet</p>
          <Button variant="outline" onClick={openAdd}>Add your first customer</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {customers.map((customer) => (
              <motion.div key={customer.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Card className="group hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{customer.name}</CardTitle>
                        <div className="flex flex-col gap-0.5 mt-1">
                          {customer.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />{customer.email}
                            </p>
                          )}
                          {customer.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{customer.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-400 border-amber-400/30 gap-1 shrink-0">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {customer.loyaltyPoints} pts
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div className="rounded-md bg-secondary/30 p-2 text-center">
                        <p className="font-bold text-primary font-mono">{formatCurrency(customer.totalSpent)}</p>
                        <p className="text-xs text-muted-foreground">Lifetime</p>
                      </div>
                      <div className="rounded-md bg-secondary/30 p-2 text-center">
                        <p className="font-bold">{customer.orderCount}</p>
                        <p className="text-xs text-muted-foreground">Orders</p>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setHistoryCustomer(customer)}>
                        <ShoppingBag className="h-3 w-3 mr-1" />History
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openEdit(customer)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(customer.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createCustomer.isPending || updateCustomer.isPending}>
              {editingCustomer ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order history sheet */}
      <Sheet open={!!historyCustomer} onOpenChange={(o) => !o && setHistoryCustomer(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>{historyCustomer?.name}'s Order History</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {historyCustomer && <CustomerOrderHistory customerId={historyCustomer.id} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This customer profile will be permanently removed. Their past orders will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
