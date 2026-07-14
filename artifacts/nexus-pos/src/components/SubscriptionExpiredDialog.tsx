import { AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Modal shown when the server rejects a write with 402 SUBSCRIPTION_EXPIRED.
 * Offers a direct path to the subscription renewal page.
 */
export function SubscriptionExpiredDialog({
  open,
  onOpenChange,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description?: string;
}) {
  const [, navigate] = useLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            Subscription expired
          </DialogTitle>
          <DialogDescription>
            {description ?? "Your subscription has expired. Renew now to continue using NEXXUS POS."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate("/subscription");
            }}
          >
            Renew subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
