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
  description: string | null;
  price: number;
  imageUrl: string | null;
  categoryId: number | null;
  categoryName: string | null;
  variantGroups: VariantGroup[];
  modifierGroups: ModifierGroup[];
}

export interface Category {
  id: number;
  name: string;
  displayOrder: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as any).error ?? res.statusText);
  }
  return res.json();
}

export async function fetchMenu(slug: string): Promise<{ categories: Category[]; items: MenuItem[] }> {
  return get(`/public/menu?slug=${encodeURIComponent(slug)}`);
}

export async function fetchSettings(slug: string): Promise<PublicSettings> {
  return get(`/public/settings?slug=${encodeURIComponent(slug)}`);
}

export interface OrderItem {
  productId: number;
  quantity: number;
  unitPrice: number;
  variantChoices: Array<{ optionId: number }>;
  modifierChoices: Array<{ optionId: number }>;
  notes?: string;
}

export async function submitOrder(slug: string, items: OrderItem[], tableId?: number): Promise<{ orderId: number; orderNumber: string }> {
  return post(`/public/orders?slug=${encodeURIComponent(slug)}`, { items, tableId });
}
