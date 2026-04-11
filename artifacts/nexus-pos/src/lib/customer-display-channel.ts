export const CUSTOMER_DISPLAY_CHANNEL = "nexus-customer-display";

export type CartDisplayItem = {
  productName: string;
  quantity: number;
  effectivePrice: number;
  itemDiscount: number;
};

export type CartMessage = {
  type: "cart";
  items: CartDisplayItem[];
  subtotal: number;
  cartDiscountValue: number;
  loyaltyDiscountValue: number;
  tax: number;
  total: number;
  currency: string;
  businessName?: string;
};

export type CompleteMessage = {
  type: "complete";
  orderNumber: string;
  paymentMethod: string;
  total: number;
  cashTendered?: number;
  currency: string;
  businessName?: string;
};

export type IdleMessage = {
  type: "idle";
  businessName?: string;
};

export type CustomerDisplayMessage = CartMessage | CompleteMessage | IdleMessage;
