import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type StockMovement = {
  id: number;
  tenantId: number;
  productId: number;
  type: "sale" | "restock" | "refund" | "void" | "purchase_bill" | "adjustment" | string;
  quantity: number;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: number | null;
  notes: string | null;
  createdAt: string;
};

export type StockHistoryResponse = {
  product: { id: number; name: string; currentStock: number };
  movements: StockMovement[];
};

export function useGetProductStockHistory(
  productId: number | null | undefined,
  options?: { limit?: number },
) {
  const limit = options?.limit ?? 100;
  return useQuery<StockHistoryResponse>({
    queryKey: ["product-stock-history", productId, limit],
    queryFn: () =>
      customFetch<StockHistoryResponse>(
        `/api/products/${productId}/stock-history?limit=${limit}`,
      ),
    enabled: !!productId,
    staleTime: 30_000,
  });
}
