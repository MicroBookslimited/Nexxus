import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useListOrders, useUpdateOrderStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
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
import { Label } from "@/components/ui/label";

export function Orders() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [orderToVoid, setOrderToVoid] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: orders, isLoading } = useListOrders(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );
  
  const updateStatus = useUpdateOrderStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const filteredOrders = orders?.filter(order => 
    order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleVoidConfirm = () => {
    if (!orderToVoid || !voidReason.trim()) return;

    updateStatus.mutate({
      id: orderToVoid,
      data: { status: "voided", voidReason }
    }, {
      onSuccess: () => {
        toast({ title: "Order Voided" });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        setVoidDialogOpen(false);
        setOrderToVoid(null);
        setVoidReason("");
      }
    });
  };

  const openVoidDialog = (id: number) => {
    setOrderToVoid(id);
    setVoidReason("");
    setVoidDialogOpen(true);
  };

  const toggleExpand = (id: number) => {
    setExpandedOrderId(prev => prev === id ? null : id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
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
      className="p-8 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Order History</h2>
          <p className="text-muted-foreground mt-1">View and manage all transactions.</p>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search order number..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
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
                <TableHead className="text-right pr-6 w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                      {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
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
                      {order.status === 'completed' && (
                        <Button variant="outline" size="sm" className="h-8 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => openVoidDialog(order.id)}>
                          Void
                        </Button>
                      )}
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
                                  <div key={item.id} className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">{item.quantity}x {item.productName}</span>
                                    <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
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
                                  {order.paymentMethod === 'split' 
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
              {!isLoading && filteredOrders?.length === 0 && (
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
    </motion.div>
  );
}
