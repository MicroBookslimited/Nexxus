/**
 * Per-product editor for volume pricing tiers + multi-unit conversions.
 * Reads/writes through the /products/:id/pricing-tiers and /purchase-units
 * endpoints. Surfaced as a tab in the product details dialog.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Layers, Ruler, Save } from "lucide-react";
import {
  getPricingTiers, replacePricingTiers, type PricingTier,
  getPurchaseUnits, replacePurchaseUnits, type PurchaseUnit,
} from "@/lib/saas-api";

type DraftTier = { minQty: string; maxQty: string; unitPrice: string };
type DraftUnit = { unitName: string; conversionFactor: string; isPurchase: boolean; isSale: boolean };

export function PricingUnitsEditor({
  productId,
  basePrice,
  baseUnit,
}: {
  productId: number;
  basePrice: number;
  baseUnit: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  /* ─── load ─── */
  const tiersQ = useQuery({
    queryKey: ["pricing-tiers", productId],
    queryFn: () => getPricingTiers(productId),
  });
  const unitsQ = useQuery({
    queryKey: ["purchase-units", productId],
    queryFn: () => getPurchaseUnits(productId),
  });

  /* ─── draft state ─── */
  const [tiers, setTiers] = useState<DraftTier[]>([]);
  const [units, setUnits] = useState<DraftUnit[]>([]);

  useEffect(() => {
    if (tiersQ.data) {
      setTiers(tiersQ.data.map((t: PricingTier) => ({
        minQty: String(t.minQty),
        maxQty: t.maxQty == null ? "" : String(t.maxQty),
        unitPrice: String(t.unitPrice),
      })));
    }
  }, [tiersQ.data]);

  useEffect(() => {
    if (unitsQ.data) {
      setUnits(unitsQ.data.map((u: PurchaseUnit) => ({
        unitName: u.unitName,
        conversionFactor: String(u.conversionFactor),
        isPurchase: u.isPurchase,
        isSale: u.isSale,
      })));
    }
  }, [unitsQ.data]);

  /* ─── save mutations ─── */
  const saveTiers = useMutation({
    mutationFn: () => {
      const payload = tiers
        .filter(t => t.minQty.trim() !== "" && t.unitPrice.trim() !== "")
        .map(t => ({
          minQty: Number(t.minQty),
          maxQty: t.maxQty.trim() === "" ? null : Number(t.maxQty),
          unitPrice: Number(t.unitPrice),
        }));
      for (const t of payload) {
        if (!Number.isFinite(t.minQty) || !Number.isFinite(t.unitPrice) ||
            (t.maxQty !== null && !Number.isFinite(t.maxQty))) {
          throw new Error("All tier numbers must be valid");
        }
        if (t.maxQty !== null && t.maxQty < t.minQty) {
          throw new Error(`Max (${t.maxQty}) cannot be less than min (${t.minQty})`);
        }
      }
      return replacePricingTiers(productId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pricing-tiers", productId] });
      toast({ title: "Pricing tiers saved" });
    },
    onError: (e) => toast({
      title: "Failed to save tiers",
      description: e instanceof Error ? e.message : String(e),
      variant: "destructive",
    }),
  });

  const saveUnits = useMutation({
    mutationFn: () => {
      const payload = units
        .filter(u => u.unitName.trim() !== "" && u.conversionFactor.trim() !== "")
        .map(u => ({
          unitName: u.unitName.trim(),
          conversionFactor: Number(u.conversionFactor),
          isPurchase: u.isPurchase,
          isSale: u.isSale,
        }));
      for (const u of payload) {
        if (!Number.isFinite(u.conversionFactor) || u.conversionFactor <= 0) {
          throw new Error(`Conversion for "${u.unitName}" must be a positive number`);
        }
      }
      return replacePurchaseUnits(productId, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-units", productId] });
      toast({ title: "Units saved" });
    },
    onError: (e) => toast({
      title: "Failed to save units",
      description: e instanceof Error ? e.message : String(e),
      variant: "destructive",
    }),
  });

  if (tiersQ.isLoading || unitsQ.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-8 p-1">
      {/* ─────── PRICING TIERS ─────── */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Volume Pricing
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Charge less per unit when customers buy more. Base price is{" "}
              <span className="font-mono">{basePrice.toFixed(2)}</span> per <span className="font-mono">{baseUnit}</span>.
              Tiers apply automatically in the POS.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setTiers([
            ...tiers, { minQty: "", maxQty: "", unitPrice: "" },
          ])}>
            <Plus className="h-4 w-4 mr-1" /> Tier
          </Button>
        </header>

        {tiers.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-4 border border-dashed border-border rounded-md text-center">
            No tiers — base price applies at every quantity.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Min Qty</span>
              <span>Max Qty (blank = ∞)</span>
              <span>Unit Price</span>
              <span className="w-8" />
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                <Input
                  type="number" min="0" step="0.01" placeholder="e.g. 1"
                  value={t.minQty}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, minQty: e.target.value } : x))}
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="e.g. 11"
                  value={t.maxQty}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, maxQty: e.target.value } : x))}
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="e.g. 9.50"
                  value={t.unitPrice}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))}
                />
                <Button
                  size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                  onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveTiers.mutate()} disabled={saveTiers.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {saveTiers.isPending ? "Saving…" : "Save Pricing"}
          </Button>
        </div>
      </section>

      {/* ─────── UNITS OF MEASURE ─────── */}
      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" /> Purchase / Sale Units
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Stock is kept in <span className="font-mono">{baseUnit}</span>. Define alternate units like
              {" "}<em>Case</em>, <em>Dozen</em>, or <em>Sack</em> with a conversion factor.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setUnits([
            ...units, { unitName: "", conversionFactor: "", isPurchase: true, isSale: false },
          ])}>
            <Plus className="h-4 w-4 mr-1" /> Unit
          </Button>
        </header>

        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-2 py-4 border border-dashed border-border rounded-md text-center">
            Only the base unit ({baseUnit}) is available. Add purchase units like Case or Dozen.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[1.2fr_1fr_auto_auto_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Unit Name</span>
              <span>= How many {baseUnit}?</span>
              <span>Buy</span>
              <span>Sell</span>
              <span className="w-8" />
            </div>
            {units.map((u, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_auto_auto_auto] gap-2 items-center">
                <Input
                  placeholder="e.g. Case"
                  value={u.unitName}
                  onChange={(e) => setUnits(units.map((x, j) => j === i ? { ...x, unitName: e.target.value } : x))}
                />
                <Input
                  type="number" min="0" step="0.01" placeholder="e.g. 24"
                  value={u.conversionFactor}
                  onChange={(e) => setUnits(units.map((x, j) => j === i ? { ...x, conversionFactor: e.target.value } : x))}
                />
                <div className="flex justify-center w-12">
                  <Switch
                    checked={u.isPurchase}
                    onCheckedChange={(v) => setUnits(units.map((x, j) => j === i ? { ...x, isPurchase: v } : x))}
                  />
                </div>
                <div className="flex justify-center w-12">
                  <Switch
                    checked={u.isSale}
                    onCheckedChange={(v) => setUnits(units.map((x, j) => j === i ? { ...x, isSale: v } : x))}
                  />
                </div>
                <Button
                  size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10"
                  onClick={() => setUnits(units.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveUnits.mutate()} disabled={saveUnits.isPending}>
            <Save className="h-4 w-4 mr-1" />
            {saveUnits.isPending ? "Saving…" : "Save Units"}
          </Button>
        </div>

        {baseUnit !== "each" && (
          <p className="text-[11px] text-muted-foreground italic">
            Tip: common conversions are pre-applied for {baseUnit} (e.g. kg → 1000 g, lb → 16 oz). You only need
            to add overrides like custom case sizes.
          </p>
        )}
      </section>

      {/* base unit reminder, used as Label so it's not removed by Tabs hover styles */}
      <Label className="sr-only">Pricing &amp; Units for product {productId}</Label>
    </div>
  );
}
