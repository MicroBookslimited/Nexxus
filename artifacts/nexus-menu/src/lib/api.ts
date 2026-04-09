const BASE = import.meta.env.VITE_API_URL || "/api";

export interface PublicSettings {
  business_name: string;
  business_address: string;
  business_phone: string;
  tax_rate: string;
  receipt_footer: string;
  base_currency: string;
  secondary_currency: string;
  currency_rate: string;
}

export interface VariantOption {
  id: number;
  name: string;
  priceAdjustment: number;
}

export interface VariantGroup {
  id: number;
  name: string;
  isRequired: boolean;
  options: VariantOption[];
}

export interface ModifierOption {
  id: number;
  name: string;
  priceAdjustment: number;
}

export interface ModifierGroup {
  id: number;
  name: string;
  isMultiSelect: boolean;
  options: ModifierOption[];
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string | null;
  price: number;
  category?: string | null;
  imageUrl?: string | null;
  isAvailable: boolean;
  variantGroups: VariantGroup[];
  modifierGroups: ModifierGroup[];
}

export interface MenuResponse {
  products: MenuItem[];
  categories: string[];
}

export async function fetchMenu(slug: string): Promise<MenuResponse> {
  const r = await fetch(`${BASE}/public/menu/${slug}`);
  if (!r.ok) throw new Error(`Failed to load menu (${r.status})`);
  return r.json();
}

export async function fetchSettings(slug: string): Promise<PublicSettings> {
  const r = await fetch(`${BASE}/public/settings/${slug}`);
  if (!r.ok) throw new Error(`Failed to load settings (${r.status})`);
  return r.json();
}

export interface CreateOrderPayload {
  items: Array<{
    productId: number;
    quantity: number;
    variantChoices?: Array<{ optionId: number; optionName: string; groupName: string; priceAdjustment: number }>;
    modifierChoices?: Array<{ optionId: number; optionName: string; groupName: string; priceAdjustment: number }>;
  }>;
  customerName?: string;
  customerEmail?: string;
  notes?: string;
  orderType: "online" | "kiosk";
}

export interface OrderResult {
  orderNumber: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  orderType: string;
}

export async function submitOrder(slug: string, payload: CreateOrderPayload): Promise<OrderResult> {
  const r = await fetch(`${BASE}/public/orders/${slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error || `Order failed (${r.status})`);
  }
  return r.json();
}
