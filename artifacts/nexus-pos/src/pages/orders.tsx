import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListOrders, useUpdateOrderStatus, useChargeOrder, useGetSettings } from "@workspace/api-client-react";
import { useStaff } from "@/contexts/StaffContext";
import { buildReceiptHtml, openReceiptWindow, openWhatsAppReceipt } from "@/lib/receipt";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronUp, CreditCard, Banknote, SplitSquareHorizontal, Receipt, ShieldAlert, RotateCcw, Printer, CalendarDays, X, WifiOff } from "lucide-react";
import { getQueue, type QueuedRequest } from "@/lib/offline-queue";
import { PinPad } from "@/components/PinPad";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

const todayStr = () => format(new Date(), "yyyy-MM-dd");

function getPreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const today = fmt(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const ys = fmt(y); return { from: ys, to: ys };
  }
  if (preset === "week") {
    const start = new Date(now); start.setDate(now.getDate() - 6);
    return { from: fmt(start), to: today };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(start), to: today };
  }
  return { from: "", to: "" };
}

function getOfflineOrders(): QueuedRequest[] {
  return getQueue().filter(
    (r) => r.url === "/api/orders" && r.method === "POST" && r.displayData
  );
}

export function Orders() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [expandedOfflineId, setExpandedOfflineId] = useState<string | null>(null);
  const [offlineOrders, setOfflineOrders] = useState<QueuedRequest[]>(getOfflineOrders);

  useEffect(() => {
    const refresh = () => setOfflineOrders(getOfflineOrders());
    window.addEventListener("nexus:queue-changed", refresh);
    return () => window.removeEventListener("nexus:queue-changed", refresh);
  }, []);
  
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [orderToVoid, setOrderToVoid] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [managerPinOpen, setManagerPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: "void" | "refund" | "reprint"; orderId: number } | null>(null);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [orderToRefund, setOrderToRefund] = useState<number | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [reprintOrder, setReprintOrder] = useState<NonNullable<typeof orders>[0] | null>(null);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappOrder, setWhatsappOrder] = useState<NonNullable<typeof orders>[0] | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const [chargeDialogOpen, setChargeDialogOpen] = useState(false);
  const [orderToCharge, setOrderToCharge] = useState<{ id: number; orderNumber: string; total: number } | null>(null);
  const [chargePaymentMethod, setChargePaymentMethod] = useState<"card" | "cash" | "split">("card");
  const [chargeSplitCard, setChargeSplitCard] = useState(0);
  const [chargeSplitCash, setChargeSplitCash] = useState(0);

  const applyPreset = (preset: string) => {
    const { from, to } = getPreset(preset);
    setFromDate(from); setToDate(to);
  };

  const activePreset = (() => {
    const today = todayStr();
    const { from: yFrom, to: yTo } = getPreset("yesterday");
    const { from: wFrom } = getPreset("week");
    const { from: mFrom } = getPreset("month");
    if (fromDate === today && toDate === today) return "today";
    if (fromDate === yFrom && toDate === yTo) return "yesterday";
    if (fromDate === wFrom && toDate === today) return "week";
    if (fromDate === mFrom && toDate === today) return "month";
    if (!fromDate && !toDate) return "all";
    return "custom";
  })();

  const { staff: sessionStaff, can } = useStaff();
  const canViewAllOrders = can("reports.view");

  const listParams: Record<string, any> = {};
  if (statusFilter !== "all") listParams.status = statusFilter;
  if (fromDate) listParams.from = fromDate;
  if (toDate) listParams.to = toDate;
  // Cashiers only see their own orders; admins/managers see everything
  if (!canViewAllOrders && sessionStaff?.id) listParams.staffId = sessionStaff.id;

  const { data: orders, isLoading } = useListOrders(listParams);
  const { data: settings } = useGetSettings();
  const updateStatus = useUpdateOrderStatus();
  const chargeOrder = useChargeOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredOrders = orders?.filter(order => 
    order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleVoidConfirm = () => {
    if (!orderToVoid || !voidReason.trim()) return;
    updateStatus.mutate(
      { id: orderToVoid, data: { status: "voided", voidReason } },
      {
        onSuccess: () => {
          toast({ title: "Order Voided", description: "Stock has been restored." });
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          setVoidDialogOpen(false);
          setOrderToVoid(null);
          setVoidReason("");
        },
      }
    );
  };

  const handleRefundConfirm = () => {
    if (!orderToRefund || !refundReason.trim()) return;
    updateStatus.mutate(
      { id: orderToRefund, data: { status: "refunded", voidReason: refundReason } },
      {
        onSuccess: () => {
          toast({ title: "Order Refunded", description: "Stock has been restored." });
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
          setRefundDialogOpen(false);
          setOrderToRefund(null);
          setRefundReason("");
        },
      }
    );
  };

  const handleReprintReceipt = (order: NonNullable<typeof orders>[0]) => {
    const html = buildReceiptHtml(
      {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        items: order.items,
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
        discountValue: order.discountValue,
        paymentMethod: order.paymentMethod,
        splitCardAmount: order.splitCardAmount,
        splitCashAmount: order.splitCashAmount,
        cashTendered: order.cashTendered,
        notes: order.notes,
        status: order.status,
      },
      settings ?? {},
    );
    openReceiptWindow(html);
  };

  const openManagerPin = (type: "void" | "refund" | "reprint", orderId: number) => {
    setPendingAction({ type, orderId });
    setManagerPinOpen(true);
  };

  const handleManagerPinSuccess = () => {
    if (!pendingAction) return;
    setManagerPinOpen(false);
    const { type, orderId } = pendingAction;
    setPendingAction(null);

    if (type === "void") {
      setOrderToVoid(orderId);
      setVoidReason("");
      setVoidDialogOpen(true);
    } else if (type === "refund") {
      setOrderToRefund(orderId);
      setRefundReason("");
      setRefundDialogOpen(true);
    } else if (type === "reprint") {
      const order = orders?.find(o => o.id === orderId) ?? null;
      if (order) handleReprintReceipt(order);
    }
  };

  const openChargeDialog = (order: { id: number; orderNumber: string; total: number }) => {
    setOrderToCharge(order);
    setChargePaymentMethod("card");
    setChargeSplitCard(Number((order.total / 2).toFixed(2)));
    setChargeSplitCash(Number((order.total - Number((order.total / 2).toFixed(2))).toFixed(2)));
    setChargeDialogOpen(true);
  };

  const handleChargeConfirm = () => {
    if (!orderToCharge) return;
    const isSplitValid = chargePaymentMethod !== "split" || Math.abs(chargeSplitCard + chargeSplitCash - orderToCharge.total) < 0.01;
    if (!isSplitValid) {
      toast({ title: "Invalid split amounts", variant: "destructive" });
      return;
    }

    chargeOrder.mutate({
      id: orderToCharge.id,
      data: {
        paymentMethod: chargePaymentMethod,
        splitCardAmount: chargePaymentMethod === "split" ? chargeSplitCard : undefined,
        splitCashAmount: chargePaymentMethod === "split" ? chargeSplitCash : undefined,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Payment Collected", description: `${orderToCharge.orderNumber} marked as completed.` });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
        setChargeDialogOpen(false);
        setOrderToCharge(null);
      },
      onError: () => {
        toast({ title: "Charge Failed", variant: "destructive" });
      }
    });
  };

  const handlePrintBill = (order: typeof orders extends Array<infer T> ? T : never) => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    win.document.write(`
      <html><head><title>Bill – ${order.orderNumber}</title>
      <style>body{font-family:monospace;font-size:13px;padding:16px;} h2{text-align:center} .row{display:flex;justify-content:space-between;} .sep{border-top:1px dashed #333;margin:8px 0;} .bold{font-weight:bold;} .center{text-align:center;}</style>
      </head><body>
      <h2>NEXXUS POS</h2>
      <p class="center">Your Business, Connected.</p>
      <div class="sep"></div>
      <div class="row"><span>Order:</span><span>${order.orderNumber}</span></div>
      <div class="row"><span>Date:</span><span>${format(new Date(order.createdAt), "dd/MM/yyyy, h:mm a")}</span></div>
      <div class="sep"></div>
      ${order.items.map(item => `<div class="row"><span>${item.quantity}x ${item.productName}</span><span>${formatCurrency(item.lineTotal)}</span></div>`).join("")}
      <div class="sep"></div>
      <div class="row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
      <div class="row"><span>Tax (10%)</span><span>${formatCurrency(order.tax)}</span></div>
      <div class="row bold"><span>Total</span><span>${formatCurrency(order.total)}</span></div>
      <div class="sep"></div>
      <p class="center">*** BILL – PAYMENT PENDING ***</p>
      <p class="center">Powered by MicroBooks</p>
      <script>window.onload=function(){window.onafterprint=function(){window.close();};if(window.matchMedia){var mql=window.matchMedia('print');var h=function(m){if(!m.matches){mql.removeListener(h);window.close();}};mql.addListener(h);}window.print();};<\/script>
      </body></html>
    `);
    win.document.close();
  };

  const toggleExpand = (id: number) => {
    setExpandedOrderId(prev => prev === id ? null : id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-0">Open</Badge>;
      case 'completed': return <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-0">Completed</Badge>;
      case 'pending': return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-0">Pending</Badge>;
      case 'cancelled': return <Badge variant="secondary" className="border-0">Cancelled</Badge>;
      case 'voided': 
      case 'refunded': return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0 capitalize">{status}</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 sm:p-8 space-y-4 sm:space-y-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Order History</h2>
          <p className="text-muted-foreground mt-1 text-sm">View and manage all transactions.</p>
        </div>
        
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative w-full sm:w-52">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search order number..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 w-full"
            />
          </div>

          {/* Preset shortcut pills */}
          <Button
            size="sm"
            variant={activePreset === "all" ? "default" : "outline"}
            className="h-9 text-xs"
            onClick={() => { setFromDate(""); setToDate(""); }}
          >
            All Time
          </Button>
          {(["today", "yesterday", "week", "month"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={activePreset === p ? "default" : "outline"}
              className="h-9 text-xs capitalize"
              onClick={() => applyPreset(p)}
            >
              {p === "week" ? "Last 7 Days" : p === "month" ? "This Month" : p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}

          {/* From / To date inputs */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-md px-2 py-1">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none w-32"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              onChange={e => setToDate(e.target.value)}
              className="bg-transparent text-sm text-foreground outline-none w-32"
            />
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(""); setToDate(""); }} title="Clear dates" className="ml-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open (Unpaid)</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Order Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right pr-6 w-[180px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {offlineOrders.map((req) => {
                const d = req.displayData!;
                const isExpanded = expandedOfflineId === req.id;
                return (
                  <React.Fragment key={req.id}>
                    <TableRow
                      className={`cursor-pointer border-l-2 border-l-amber-500 ${isExpanded ? "bg-amber-500/5" : "hover:bg-amber-500/5"}`}
                      onClick={() => setExpandedOfflineId(prev => prev === req.id ? null : req.id)}
                    >
                      <TableCell className="pl-4 text-muted-foreground">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </TableCell>
                      <TableCell className="font-medium font-mono">{d.orderNumber}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(req.timestamp), "dd/MM/yyyy, h:mm a")}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 border gap-1 pr-2">
                          <WifiOff className="h-3 w-3" />
                          Pending Sync
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.items.length} item{d.items.length !== 1 ? "s" : ""}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatCurrency(d.total)}
                      </TableCell>
                      <TableCell className="text-right pr-6" />
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="bg-amber-500/5 hover:bg-amber-500/5">
                        <TableCell colSpan={7} className="p-0 border-b border-amber-500/20">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-6 grid grid-cols-2 gap-8">
                              <div>
                                <h4 className="font-semibold mb-3">Order Items</h4>
                                <div className="space-y-2">
                                  {d.items.map((item, i) => (
                                    <div key={i} className="text-sm flex justify-between">
                                      <span className="text-muted-foreground">{item.quantity}x {item.productName}</span>
                                      <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
                                    </div>
                                  ))}
                                </div>
                                <Separator className="my-2" />
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Subtotal</span>
                                  <span className="font-mono">{formatCurrency(d.subtotal)}</span>
                                </div>
                                {d.discountValue > 0 && (
                                  <div className="flex justify-between text-sm text-amber-500">
                                    <span>Discount</span>
                                    <span className="font-mono">-{formatCurrency(d.discountValue)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Tax</span>
                                  <span className="font-mono">{formatCurrency(d.tax)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-sm mt-1">
                                  <span>Total</span>
                                  <span className="font-mono">{formatCurrency(d.total)}</span>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="font-semibold mb-1 text-sm">Payment Method</h4>
                                  <p className="text-sm text-muted-foreground capitalize">
                                    {d.paymentMethod === "split"
                                      ? `Split (Card: ${formatCurrency(d.splitCardAmount ?? 0)}, Cash: ${formatCurrency(d.splitCashAmount ?? 0)})`
                                      : d.paymentMethod}
                                  </p>
                                </div>
                                {d.cashTendered && (
                                  <div>
                                    <h4 className="font-semibold mb-1 text-sm">Cash Tendered</h4>
                                    <p className="text-sm text-muted-foreground">{formatCurrency(d.cashTendered)}</p>
                                  </div>
                                )}
                                {d.notes && (
                                  <div>
                                    <h4 className="font-semibold mb-1 text-sm">Notes</h4>
                                    <p className="text-sm text-muted-foreground">{d.notes}</p>
                                  </div>
                                )}
                                <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                                  <WifiOff className="h-3 w-3 inline mr-1.5 mb-0.5" />
                                  This order was saved offline and will sync automatically when the connection is restored.
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="h-16">
                      <div className="h-4 bg-muted animate-pulse rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredOrders?.map((order) => (
                <React.Fragment key={order.id}>
                  <TableRow className={`cursor-pointer ${expandedOrderId === order.id ? 'bg-muted/50' : ''}`} onClick={() => toggleExpand(order.id)}>
                    <TableCell className="pl-4 text-muted-foreground">
                      {expandedOrderId === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="font-medium">{order.orderNumber}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(order.createdAt), "dd/MM/yyyy, h:mm a")}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(order.status)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {order.items.length} items
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(order.total)}
                    </TableCell>
                    <TableCell className="text-right pr-6" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5 justify-end">
                        {order.status === 'open' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                              onClick={() => handlePrintBill(order)}
                            >
                              <Receipt className="h-3 w-3" />
                              Bill
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 gap-1 text-xs bg-primary hover:bg-primary/90"
                              onClick={() => openChargeDialog({ id: order.id, orderNumber: order.orderNumber, total: order.total })}
                            >
                              <CreditCard className="h-3 w-3" />
                              Charge
                            </Button>
                          </>
                        )}
                        {order.status === 'completed' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
                              onClick={() => {
                                setWhatsappOrder(order);
                                setWhatsappPhone("");
                                setWhatsappDialogOpen(true);
                              }}
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                              WhatsApp
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                              onClick={() => openManagerPin("refund", order.id)}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Refund
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1 text-xs border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                              onClick={() => openManagerPin("reprint", order.id)}
                            >
                              <Printer className="h-3 w-3" />
                              Reprint
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                              onClick={() => openManagerPin("void", order.id)}
                            >
                              Void
                            </Button>
                          </>
                        )}
                        {(order.status === 'refunded' || order.status === 'voided') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs border-muted-foreground/30 text-muted-foreground hover:text-foreground"
                            onClick={() => openManagerPin("reprint", order.id)}
                          >
                            <Printer className="h-3 w-3" />
                            Reprint
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {expandedOrderId === order.id && (
                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                      <TableCell colSpan={7} className="p-0 border-b">
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-6 grid grid-cols-2 gap-8">
                            <div>
                              <h4 className="font-semibold mb-3">Order Items</h4>
                              <div className="space-y-2">
                                {order.items.map(item => (
                                  <div key={item.id} className="text-sm">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">{item.quantity}x {item.productName}</span>
                                      <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
                                    </div>
                                    {item.variantChoices && (item.variantChoices as any[]).length > 0 && (
                                      <p className="text-xs text-primary/70 pl-3 mt-0.5">
                                        ↳ {(item.variantChoices as any[]).map((c: any) => c.optionName).join(", ")}
                                      </p>
                                    )}
                                    {item.modifierChoices && (item.modifierChoices as any[]).length > 0 && (
                                      <p className="text-xs text-amber-400/80 pl-3 mt-0.5">
                                        ↳ + {(item.modifierChoices as any[]).map((c: any) => c.optionName).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                ))}
                                <Separator className="my-2" />
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Subtotal</span>
                                  <span className="font-mono">{formatCurrency(order.subtotal)}</span>
                                </div>
                                {order.discountValue && order.discountValue > 0 && (
                                  <div className="flex justify-between text-sm text-amber-500">
                                    <span>Discount</span>
                                    <span className="font-mono">-{formatCurrency(order.discountValue)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Tax</span>
                                  <span className="font-mono">{formatCurrency(order.tax)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-sm mt-1">
                                  <span>Total</span>
                                  <span className="font-mono">{formatCurrency(order.total)}</span>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-semibold mb-1 text-sm">Payment Method</h4>
                                <p className="text-sm text-muted-foreground capitalize">
                                  {order.status === 'open'
                                    ? <span className="text-blue-400">Pending payment</span>
                                    : order.paymentMethod === 'split' 
                                      ? `Split (Card: ${formatCurrency(order.splitCardAmount || 0)}, Cash: ${formatCurrency(order.splitCashAmount || 0)})`
                                      : order.paymentMethod}
                                </p>
                              </div>
                              {order.notes && (
                                <div>
                                  <h4 className="font-semibold mb-1 text-sm">Notes</h4>
                                  <p className="text-sm text-muted-foreground">{order.notes}</p>
                                </div>
                              )}
                              {order.voidReason && (
                                <div>
                                  <h4 className="font-semibold mb-1 text-sm text-destructive">Void Reason</h4>
                                  <p className="text-sm text-destructive/80">{order.voidReason}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              {!isLoading && (!filteredOrders || filteredOrders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Manager PIN Override Dialog */}
      <Dialog open={managerPinOpen} onOpenChange={(o) => { if (!o) { setManagerPinOpen(false); setPendingAction(null); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-4 w-4" />
              Manager Override Required
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground text-center mb-6">
              {pendingAction?.type === "refund"
                ? "Processing a refund requires a manager or admin PIN."
                : pendingAction?.type === "reprint"
                ? "Reprinting a receipt requires a manager or admin PIN."
                : "Voiding an order requires a manager or admin PIN."}
            </p>
            <PinPad
              onSuccess={handleManagerPinSuccess}
              requiredRoles={["manager", "admin", "supervisor"]}
              title=""
              subtitle=""
              pinLength={4}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Receipt Dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={(o) => { if (!o) setWhatsappDialogOpen(false); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Send Receipt via WhatsApp
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {whatsappOrder && (
              <p className="text-xs text-muted-foreground">
                Order <span className="font-mono font-semibold text-foreground">{whatsappOrder.orderNumber}</span> &mdash; {formatCurrency(whatsappOrder.total)}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="wa-phone" className="text-sm">Customer phone number</Label>
              <Input
                id="wa-phone"
                type="tel"
                placeholder="+1 876 555 0123"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && whatsappPhone.replace(/\D/g, "").length >= 7 && whatsappOrder) {
                    openWhatsAppReceipt(whatsappPhone, whatsappOrder as any, settings ?? {});
                    setWhatsappDialogOpen(false);
                  }
                }}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">Include country code, e.g. +1876 for Jamaica</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setWhatsappDialogOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={whatsappPhone.replace(/\D/g, "").length < 7}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                if (!whatsappOrder) return;
                openWhatsAppReceipt(whatsappPhone, whatsappOrder as any, settings ?? {});
                setWhatsappDialogOpen(false);
                toast({ title: "Opening WhatsApp…", description: "Receipt is pre-filled and ready to send." });
              }}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Open WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The order status will be changed to voided.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-2">
            <Label htmlFor="voidReason">Reason for void <span className="text-destructive">*</span></Label>
            <Input 
              id="voidReason" 
              value={voidReason} 
              onChange={e => setVoidReason(e.target.value)} 
              placeholder="e.g. Customer changed mind, Error in entry..."
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => { e.preventDefault(); handleVoidConfirm(); }}
              disabled={!voidReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Refund Dialog */}
      <AlertDialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-500" />
              Refund this order?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The order will be marked as refunded and inventory will be restored. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-2">
            <Label htmlFor="refundReason">Reason for refund <span className="text-destructive">*</span></Label>
            <Input
              id="refundReason"
              value={refundReason}
              onChange={e => setRefundReason(e.target.value)}
              placeholder="e.g. Wrong item, Customer complaint, Duplicate charge…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRefundConfirm(); }}
              disabled={!refundReason.trim()}
              className="bg-amber-500 text-white hover:bg-amber-600"
            >
              Confirm Refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Charge Dialog */}
      <Dialog open={chargeDialogOpen} onOpenChange={setChargeDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Collect Payment
            </DialogTitle>
          </DialogHeader>

          {orderToCharge && (
            <div className="space-y-4">
              <div className="bg-secondary/30 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{orderToCharge.orderNumber}</span>
                <span className="text-xl font-bold font-mono text-primary">{formatCurrency(orderToCharge.total)}</span>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Payment Method</Label>
                <div className="flex gap-2">
                  <Button
                    variant={chargePaymentMethod === "card" ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => setChargePaymentMethod("card")}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />Card
                  </Button>
                  <Button
                    variant={chargePaymentMethod === "cash" ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => setChargePaymentMethod("cash")}
                  >
                    <Banknote className="mr-2 h-4 w-4" />Cash
                  </Button>
                  <Button
                    variant={chargePaymentMethod === "split" ? "default" : "outline"}
                    className="flex-1 h-10"
                    onClick={() => {
                      setChargePaymentMethod("split");
                      setChargeSplitCard(Number((orderToCharge.total / 2).toFixed(2)));
                      setChargeSplitCash(Number((orderToCharge.total - Number((orderToCharge.total / 2).toFixed(2))).toFixed(2)));
                    }}
                  >
                    <SplitSquareHorizontal className="mr-2 h-4 w-4" />Split
                  </Button>
                </div>
              </div>

              {chargePaymentMethod === "split" && (
                <div className="flex gap-2 items-center bg-secondary/50 p-3 rounded-md">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Card $</label>
                    <Input type="number" value={chargeSplitCard} onChange={e => setChargeSplitCard(Number(e.target.value))} className="h-8 font-mono text-sm" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Cash $</label>
                    <Input type="number" value={chargeSplitCash} onChange={e => setChargeSplitCash(Number(e.target.value))} className="h-8 font-mono text-sm" />
                  </div>
                </div>
              )}
              {chargePaymentMethod === "split" && Math.abs(chargeSplitCard + chargeSplitCash - orderToCharge.total) >= 0.01 && (
                <p className="text-amber-500 text-xs">Amounts must equal {formatCurrency(orderToCharge.total)}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setChargeDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleChargeConfirm}
              disabled={chargeOrder.isPending || (chargePaymentMethod === "split" && !!orderToCharge && Math.abs(chargeSplitCard + chargeSplitCash - orderToCharge.total) >= 0.01)}
            >
              {chargeOrder.isPending ? "Processing…" : `Confirm Payment`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
