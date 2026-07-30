import { useState } from "react";
import {
  useListCustomers,
  useListStaff,
  useCreateWorkOrder,
} from "@workspace/api-client-react";
import type { WorkOrder } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (wo: WorkOrder) => void;
}

export function CreateWorkOrderDialog({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const { data: customers } = useListCustomers();
  const { data: staff } = useListStaff();
  const createWO = useCreateWorkOrder();

  const [custId, setCustId] = useState<number | "">("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [colour, setColour] = useState("");
  const [conditionReceived, setConditionReceived] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceChannel, setServiceChannel] = useState("in_store");
  const [priority, setPriority] = useState("normal");
  const [assignedStaffIds, setAssignedStaffIds] = useState<number[]>([]);
  const [promisedDate, setPromisedDate] = useState("");
  const [depositRequired, setDepositRequired] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setCustId(""); setContactName(""); setContactPhone(""); setContactEmail("");
    setItemDescription(""); setBrand(""); setModel(""); setSerialNumber("");
    setColour(""); setConditionReceived(""); setProblemDescription("");
    setServiceType(""); setServiceChannel("in_store"); setPriority("normal");
    setAssignedStaffIds([]); setPromisedDate(""); setDepositRequired(""); setNotes("");
  };

  const toggleStaff = (id: number) => {
    setAssignedStaffIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreate = () => {
    if (!itemDescription.trim()) { toast({ title: "Describe the item", variant: "destructive" }); return; }
    if (!problemDescription.trim()) { toast({ title: "Describe the problem", variant: "destructive" }); return; }
    if (!custId && !contactName.trim()) { toast({ title: "Select a customer or enter a contact name", variant: "destructive" }); return; }

    createWO.mutate(
      {
        ...(custId ? { customerId: Number(custId) } : {}),
        ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
        ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
        ...(contactEmail.trim() ? { contactEmail: contactEmail.trim() } : {}),
        itemDescription: itemDescription.trim(),
        ...(brand.trim() ? { brand: brand.trim() } : {}),
        ...(model.trim() ? { model: model.trim() } : {}),
        ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
        ...(colour.trim() ? { colour: colour.trim() } : {}),
        ...(conditionReceived.trim() ? { conditionReceived: conditionReceived.trim() } : {}),
        problemDescription: problemDescription.trim(),
        ...(serviceType ? { serviceType } : {}),
        serviceChannel: serviceChannel as "in_store" | "on_site" | "pickup" | "delivery" | "remote",
        priority: priority as "low" | "normal" | "high" | "urgent" | "emergency",
        ...(assignedStaffIds.length > 0 ? { assignedStaffIds } : {}),
        ...(promisedDate ? { promisedDate } : {}),
        ...(depositRequired ? { depositRequired: Number(depositRequired) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (created) => {
          toast({ title: `Work order ${created.workOrderNumber} created` });
          reset();
          onCreated(created);
        },
        onError: (e: any) =>
          toast({ title: "Could not create work order", description: e?.message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Work Order</DialogTitle>
          <DialogDescription>Record the asset, the problem, and who it belongs to.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Customer</h3>
            <div className="space-y-3">
              <div>
                <Label>Customer</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={custId}
                  onChange={(e) => setCustId(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Walk-in (fill contact fields below)</option>
                  {(customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              {!custId && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Name *</Label>
                    <Input value={contactName} onChange={(e) => setContactName(e.target.value)} className="mt-1" placeholder="Full name" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1" placeholder="876-000-0000" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1" placeholder="customer@email.com" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Asset */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Asset / Item</h3>
            <div className="space-y-3">
              <div>
                <Label>Description *</Label>
                <Input
                  placeholder="e.g. Samsung TV 55″, iPhone 14 Pro, Lawnmower…"
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label>Brand</Label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="mt-1" placeholder="Samsung" />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} className="mt-1" placeholder="UA55CU8000" />
                </div>
                <div>
                  <Label>Serial / IMEI</Label>
                  <Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} className="mt-1" placeholder="SN/IMEI" />
                </div>
                <div>
                  <Label>Colour</Label>
                  <Input value={colour} onChange={(e) => setColour(e.target.value)} className="mt-1" placeholder="Black" />
                </div>
              </div>
              <div>
                <Label>Condition received</Label>
                <Input value={conditionReceived} onChange={(e) => setConditionReceived(e.target.value)} className="mt-1" placeholder="Good / Scratched / Cracked screen…" />
              </div>
            </div>
          </div>

          {/* Problem */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Problem & Service</h3>
            <div className="space-y-3">
              <div>
                <Label>Problem description *</Label>
                <Textarea
                  placeholder="What's wrong with it? Describe the fault in detail."
                  value={problemDescription}
                  onChange={(e) => setProblemDescription(e.target.value)}
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label>Service type</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={serviceType}
                    onChange={(e) => setServiceType(e.target.value)}
                  >
                    <option value="">— select —</option>
                    <option value="Repair">Repair</option>
                    <option value="Installation">Installation</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Inspection">Inspection</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <Label>Channel</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={serviceChannel}
                    onChange={(e) => setServiceChannel(e.target.value)}
                  >
                    <option value="in_store">In Store</option>
                    <option value="on_site">On Site</option>
                    <option value="pickup">Pickup</option>
                    <option value="delivery">Delivery</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
              </div>

              {/* Multi-technician selector */}
              <div>
                <Label>
                  Assigned technician{assignedStaffIds.length > 1 ? "s" : ""}
                  {assignedStaffIds.length > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-primary">({assignedStaffIds.length} selected)</span>
                  )}
                </Label>
                {(staff ?? []).length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No staff members found.</p>
                ) : (
                  <div className="mt-1 border border-input rounded-md bg-background max-h-36 overflow-y-auto divide-y divide-border">
                    {(staff ?? []).map((s: any) => {
                      const checked = assignedStaffIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStaff(s.id)}
                            className="h-3.5 w-3.5 accent-primary shrink-0"
                          />
                          <span className="text-sm">{s.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Promised date</Label>
                  <Input type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Deposit required</Label>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" value={depositRequired} onChange={(e) => setDepositRequired(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} placeholder="Any special instructions or notes for the team…" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createWO.isPending}>
            {createWO.isPending ? "Creating…" : "Create Work Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
