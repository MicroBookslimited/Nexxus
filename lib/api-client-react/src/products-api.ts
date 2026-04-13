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
  options?: { limit?: number; from?: string; to?: string },
) {
  const limit = options?.limit ?? 500;
  const from = options?.from ?? "";
  const to = options?.to ?? "";
  return useQuery<StockHistoryResponse>({
    queryKey: ["product-stock-history", productId, limit, from, to],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return customFetch<StockHistoryResponse>(
        `/api/products/${productId}/stock-history?${params.toString()}`,
      );
    },
    enabled: !!productId,
    staleTime: 30_000,
  });
}
