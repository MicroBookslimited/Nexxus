import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Landmark } from "lucide-react";

export type CardType = "debit" | "credit";

/**
 * Prompt shown whenever a card is involved in a sale (pure Card payment or the
 * card portion of a Split). The chosen type is persisted on the order and
 * printed on the receipt as "Debit Card" / "Credit Card".
 *
 * NOTE: this is unrelated to the "credit" payment method, which is an
 * on-account / store-credit sale.
 */
export function CardTypeDialog({
  open,
  onSelect,
  onCancel,
}: {
  open: boolean;
  onSelect: (type: CardType) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Card Type
          </DialogTitle>
          <DialogDescription>
            Is this a debit or credit card? This is printed on the receipt.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 text-base"
            onClick={() => onSelect("debit")}
          >
            <Landmark className="h-7 w-7" />
            Debit Card
          </Button>
          <Button
            variant="outline"
            className="h-24 flex-col gap-2 text-base"
            onClick={() => onSelect("credit")}
          >
            <CreditCard className="h-7 w-7" />
            Credit Card
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
