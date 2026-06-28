import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreditCard, Landmark, Banknote, BookOpen } from "lucide-react";
import type { CardType } from "@/components/card-type-dialog";

export type SplitResult = {
  cardType: CardType | null;
  cardAmount: number;
  cashAmount: number;
  creditAmount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Single popup that collects a split payment: card type + Card amount + Cash
 * amount. Whatever is left of the amount due (Total − Card − Cash) is placed
 * on the customer's account as store credit, so a credit leg requires a
 * selected customer. The card type is only required when a card amount is
 * entered. Replaces the old inline Card/Cash inputs + separate CardTypeDialog
 * for the split flow across all POS layouts.
 */
export function SplitPaymentDialog({
  open,
  amountDue,
  baseCurrency,
  hasCustomer,
  initialCardType,
  initialCardAmount,
  initialCashAmount,
  formatCurrency,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  amountDue: number;
  baseCurrency: string;
  hasCustomer: boolean;
  initialCardType?: CardType | null;
  initialCardAmount?: number;
  initialCashAmount?: number;
  formatCurrency: (val: number, currency?: string) => string;
  onConfirm: (r: SplitResult) => void;
  onCancel: () => void;
}) {
  const [cardInput, setCardInput] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [cardType, setCardType] = useState<CardType | null>(null);

  // Seed the inputs every time the dialog opens. Default the whole amount to
  // the card portion (the most common split) unless the caller passed values.
  useEffect(() => {
    if (!open) return;
    const card = initialCardAmount != null && initialCardAmount > 0 ? initialCardAmount : amountDue;
    const cash = initialCashAmount ?? 0;
    setCardInput(card ? String(round2(card)) : "");
    setCashInput(cash ? String(round2(cash)) : "");
    setCardType(initialCardType ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const card = round2(Math.max(0, parseFloat(cardInput) || 0));
  const cash = round2(Math.max(0, parseFloat(cashInput) || 0));
  const credit = round2(Math.max(0, amountDue - card - cash));

  const over = card + cash > amountDue + 0.01;
  const needCustomer = credit > 0.005 && !hasCustomer;
  const needCardType = card > 0.005 && !cardType;
  const canConfirm = !over && !needCustomer && !needCardType;

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      cardType: card > 0.005 ? cardType : null,
      cardAmount: card,
      cashAmount: cash,
      creditAmount: credit,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Split Payment
          </DialogTitle>
          <DialogDescription>
            Amount due {formatCurrency(amountDue, baseCurrency)}. Enter the card and
            cash portions — anything left over is placed on the customer's account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Card type — only relevant when a card amount is entered */}
          <div className={`space-y-1.5 ${card <= 0.005 ? "opacity-50" : ""}`}>
            <label className="text-xs font-medium text-muted-foreground">Card type</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={cardType === "debit" ? "default" : "outline"}
                className="h-11 gap-2"
                onClick={() => setCardType("debit")}
              >
                <Landmark className="h-4 w-4" /> Debit
              </Button>
              <Button
                type="button"
                variant={cardType === "credit" ? "default" : "outline"}
                className="h-11 gap-2"
                onClick={() => setCardType("credit")}
              >
                <CreditCard className="h-4 w-4" /> Credit
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" /> Card $
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={cardInput}
                onChange={(e) => setCardInput(e.target.value)}
                className="h-10 font-mono"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Banknote className="h-3.5 w-3.5" /> Cash $
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                className="h-10 font-mono"
              />
            </div>
          </div>

          {/* Auto-computed on-account credit leg */}
          <div className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm text-amber-500">
              <BookOpen className="h-4 w-4" /> On account (credit)
            </span>
            <span className="font-mono text-sm font-semibold">{formatCurrency(credit, baseCurrency)}</span>
          </div>

          {over && (
            <p className="text-xs font-medium text-destructive">
              Card + Cash exceed the {formatCurrency(amountDue, baseCurrency)} due.
            </p>
          )}
          {!over && needCustomer && (
            <p className="text-xs font-medium text-amber-500">
              ⚠ Select a customer to place {formatCurrency(credit, baseCurrency)} on account.
            </p>
          )}
          {!over && needCardType && (
            <p className="text-xs font-medium text-amber-500">
              ⚠ Choose the card type for the {formatCurrency(card, baseCurrency)} card portion.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={!canConfirm} onClick={confirm}>Confirm split</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
