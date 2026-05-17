import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  TENANT_TOKEN_KEY,
  type Promotion,
} from "@/lib/saas-api";
import { Tag, Plus, Trash2, Pencil, Calendar } from "lucide-react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", maximumFractionDigits: 2 }).format(n || 0);
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string {
  return new Date(local).toISOString();
}

function statusOf(p: Promotion): "scheduled" | "active" | "ended" | "paused" {
  if (!p.active) return "paused";
  const now = Date.now();
  const s = new Date(p.startAt).getTime();
  const e = new Date(p.endAt).getTime();
  if (now < s) return "scheduled";
  if (now > e) return "ended";
  return "active";
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  scheduled: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  ended: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
  paused: "bg-amber-500/20 text-amber-300 border-amber-500/40",
};

export default function PromotionsPage() {
  const { toast } = useToast();
  const { staff } = useStaff();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [creating, setCreating] = useState(false);
  const staffId = staff?.id;

  const { data: promosData, isLoading } = useQuery({
    queryKey: ["/api/promotions"],
    queryFn: listPromotions,
  });

  const { data: productsData } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const token = localStorage.getItem(TENANT_TOKEN_KEY);
      const r = await fetch("/api/products", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(`Products fetch failed (${r.status})`);
      return r.json() as Promise<{ id: number; name: string; price: number }[]>;
    },
  });
  const products = productsData ?? [];

  const createMut = useMutation({
    mutationFn: (body: { productId: number; promoPrice: number; startAt: string; endAt: string; active: boolean }) => {
      if (!staffId) throw new Error("Sign in as staff to manage promotions");
      return createPromotion({ ...body, staffId });
    },
    onSuccess: () => {
      toast({ title: "Promotion created" });
      qc.invalidateQueries({ queryKey: ["/api/promotions"] });
      qc.invalidateQueries({ queryKey: ["/api/promotions/active"] });
      setCreating(false);
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<{ promoPrice: number; startAt: string; endAt: string; active: boolean }> }) => {
      if (!staffId) throw new Error("Sign in as staff to manage promotions");
      return updatePromotion(id, { ...body, staffId });
    },
    onSuccess: () => {
      toast({ title: "Promotion updated" });
      qc.invalidateQueries({ queryKey: ["/api/promotions"] });
      qc.invalidateQueries({ queryKey: ["/api/promotions/active"] });
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => {
      if (!staffId) throw new Error("Sign in as staff to manage promotions");
      return deletePromotion(id, staffId);
    },
    onSuccess: () => {
      toast({ title: "Promotion deleted" });
      qc.invalidateQueries({ queryKey: ["/api/promotions"] });
      qc.invalidateQueries({ queryKey: ["/api/promotions/active"] });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const promotions = promosData?.promotions ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            Promotions
          </h1>
          <p className="text-sm text-muted-foreground">
            Time-based promo prices. Promo price replaces and locks the regular price during the active window.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Promotion
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Promotions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : promotions.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No promotions yet. Create one to start discounting products by date.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {promotions.map((p) => {
                const st = statusOf(p);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{p.productName ?? `Product #${p.productId}`}</span>
                        <Badge variant="outline" className={statusStyles[st]}>{st}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                        <span>
                          <span className="line-through opacity-60 mr-1">{formatCurrency(p.regularPrice ?? 0)}</span>
                          <span className="font-semibold text-emerald-400">{formatCurrency(p.promoPrice)}</span>
                        </span>
                        <span className="flex items-center gap-1 text-xs">
                          <Calendar className="h-3 w-3" />
                          {new Date(p.startAt).toLocaleString()} → {new Date(p.endAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete promotion for ${p.productName ?? "this product"}?`)) {
                            deleteMut.mutate(p.id);
                          }
                        }}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <PromoDialog
        open={creating}
        onOpenChange={(o) => !o && setCreating(false)}
        products={products}
        onSubmit={(body) => createMut.mutate(body)}
        submitting={createMut.isPending}
      />

      <PromoDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        products={products}
        initial={editing ?? undefined}
        onSubmit={(body) => {
          if (!editing) return;
          updateMut.mutate({ id: editing.id, body });
        }}
        submitting={updateMut.isPending}
      />
    </div>
  );
}

function PromoDialog({
  open,
  onOpenChange,
  products,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: { id: number; name: string; price: number }[];
  initial?: Promotion;
  onSubmit: (body: { productId: number; promoPrice: number; startAt: string; endAt: string; active: boolean }) => void;
  submitting: boolean;
}) {
  const isEdit = !!initial;
  const [productId, setProductId] = useState<number | "">(initial?.productId ?? "");
  const [promoPrice, setPromoPrice] = useState<string>(initial ? String(initial.promoPrice) : "");
  const [startLocal, setStartLocal] = useState<string>(
    initial ? toLocalInputValue(initial.startAt) : toLocalInputValue(new Date().toISOString()),
  );
  const [endLocal, setEndLocal] = useState<string>(
    initial
      ? toLocalInputValue(initial.endAt)
      : toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
  );
  const [active, setActive] = useState<boolean>(initial?.active ?? true);

  const selectedProduct = products.find((p) => p.id === productId);

  const handleSubmit = () => {
    if (!productId || !promoPrice || !startLocal || !endLocal) return;
    const price = parseFloat(promoPrice);
    if (!Number.isFinite(price) || price < 0) return;
    onSubmit({
      productId: Number(productId),
      promoPrice: price,
      startAt: fromLocalInputValue(startLocal),
      endAt: fromLocalInputValue(endLocal),
      active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Promotion" : "New Promotion"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <select
              className="w-full bg-background border rounded-md h-10 px-3 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : "")}
              disabled={isEdit}
            >
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {formatCurrency(p.price)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Promo Price</Label>
              <Input
                type="number"
                step="0.01"
                value={promoPrice}
                onChange={(e) => setPromoPrice(e.target.value)}
                placeholder="0.00"
              />
              {selectedProduct && promoPrice && parseFloat(promoPrice) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Save {formatCurrency(Math.max(0, selectedProduct.price - parseFloat(promoPrice)))} vs regular
                </p>
              )}
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <Label htmlFor="promo-active" className="flex items-center justify-between">
                <span>Active</span>
                <Switch id="promo-active" checked={active} onCheckedChange={setActive} />
              </Label>
              <p className="text-xs text-muted-foreground">
                When off, this promo will not be applied even within the window.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Starts</Label>
              <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ends</Label>
              <Input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !productId || !promoPrice}>
            {submitting ? "Saving…" : (isEdit ? "Save Changes" : "Create Promotion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
