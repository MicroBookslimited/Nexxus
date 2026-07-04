import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TERMS_SECTIONS, TERMS_VERSION, TERMS_EFFECTIVE_DATE } from "@/lib/terms";

export function TermsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Terms &amp; Conditions</DialogTitle>
          <DialogDescription>
            Version {TERMS_VERSION} · Effective {TERMS_EFFECTIVE_DATE}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4 -mr-2">
          <div className="space-y-5 text-sm leading-relaxed">
            {TERMS_SECTIONS.map((section) => (
              <section key={section.heading}>
                <h3 className="font-semibold text-foreground mb-1.5">{section.heading}</h3>
                <div className="space-y-2 text-muted-foreground">
                  {section.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
