import { useState } from "react";
import { motion } from "framer-motion";
import { useListOrders, useUpdateOrderStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function Orders() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Need to manually cast "all" to undefined or correct type
  const { data: orders, isLoading } = useListOrders(
    statusFilter !== "all" ? { status: statusFilter as any } : {}
  );
  
  const updateStatus = useUpdateOrderStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const handleStatusChange = (orderId: number, newStatus: "pending" | "completed" | "cancelled") => {
    updateStatus.mutate({
      id: orderId,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        toast({ title: "Order updated" });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      }
    });
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
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Order Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right pr-6">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="h-16">
                      <div className="h-4 bg-muted animate-pulse rounded w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : orders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="pl-6 font-medium">{order.orderNumber}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={order.status} 
                      onValueChange={(val: any) => handleStatusChange(order.id, val)}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.items.length} items
                  </TableCell>
                  <TableCell className="text-right pr-6 font-mono font-medium">
                    {formatCurrency(order.total)}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && orders?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                    No orders found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
