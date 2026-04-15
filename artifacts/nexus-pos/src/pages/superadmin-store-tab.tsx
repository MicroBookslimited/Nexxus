import { useState, useEffect, useCallback, useRef } from "react";
import {
  Package, RefreshCw, Pencil, Check, X, ShoppingBag, ToggleLeft, ToggleRight,
  Search, Plus, Trash2, TrendingUp, AlertTriangle, BarChart3, Truck, ArrowUp,
  ArrowDown, ChevronDown, Layers, Tag, DollarSign, Box, Users, Filter,
} from "lucide-react";
import { SUPERADMIN_TOKEN_KEY } from "@/lib/saas-api";

/* ─── helpers ─── */
function saFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem(SUPERADMIN_TOKEN_KEY) ?? "";
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

function jmd(n: number) {
  return `J$${n.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function margin(price: number, cost: number | null) {
  if (!cost || cost === 0) return null;
  return ((price - cost) / price * 100).toFixed(1);
}

/* ─── types ─── */
type Product = {
  id: number;
  name: string;
  description: string;
  category: string;
  sku: string | null;
  brand: string | null;
  price: number;
  costPrice: number | null;
  imageEmoji: string;
  inStock: boolean;
  stockCount: number;
  lowStockThreshold: number;
  productType: string;
  supplierId: number | null;
  isActive: boolean;
  sortOrder: number;
  tags: string[] | null;
  updatedAt: string;
};

type Order = {
  id: number;
  tenantId: number;
  orderNumber: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  notes: string | null;
  fulfillmentAssignee: string | null;
  createdAt: string;
};

type Supplier = {
  id: number;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

type StockMovement = {
  movement: {
    id: number;
    productId: number;
    type: string;
    quantity: number;
    previousStock: number;
    newStock: number;
    reference: string | null;
    notes: string | null;
    performedBy: string;
    createdAt: string;
  };
  productName: string | null;
  productSku: string | null;
};

type Metrics = {
  totalProducts: number;
  activeProducts: number;
  outOfStock: number;
  lowStock: number;
  totalRevenue: number;
  pendingOrders: number;
  totalOrders: number;
  recentOrders: Order[];
};

/* ─── constants ─── */
const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "completed", "cancelled"];
const PAYMENT_STATUSES = ["unpaid", "partial", "paid"];
const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Online Gateway"];
const PRODUCT_TYPES = ["simple", "variant", "bundle"];
const MOVEMENT_TYPES = ["purchase", "adjustment", "return"];

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  processing:"bg-purple-500/15 text-purple-400 border-purple-500/30",
  shipped:   "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
};

const PAY_COLORS: Record<string, string> = {
  unpaid:  "bg-red-500/15 text-red-400 border-red-500/30",
  partial: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

/* ══════════════════════════════════════════════════════════
   OVERVIEW TAB
══════════════════════════════════════════════════════════ */
function OverviewSection() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/metrics").then(r => r.json()).then(setMetrics).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-16 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto" /></div>;
  if (!metrics) return <div className="py-16 text-center text-[#475569]">Failed to load metrics.</div>;

  const cards = [
    { label: "Total Products", value: metrics.totalProducts, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Active Products", value: metrics.activeProducts, icon: ToggleRight, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Low Stock", value: metrics.lowStock, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Out of Stock", value: metrics.outOfStock, icon: Box, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "Pending Orders", value: metrics.pendingOrders, icon: ShoppingBag, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Total Orders", value: metrics.totalOrders, icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Store Overview</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-white border border-[#2a3a55] px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Revenue card */}
      <div className="bg-gradient-to-br from-[#3b82f6]/20 to-[#1e40af]/10 border border-[#3b82f6]/30 rounded-2xl p-5">
        <p className="text-[#94a3b8] text-sm mb-1">Total Revenue (Paid Orders)</p>
        <p className="text-3xl font-bold text-white">{jmd(metrics.totalRevenue)}</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.label} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-4">
            <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon size={18} className={c.color} />
            </div>
            <p className="text-2xl font-bold text-white">{c.value}</p>
            <p className="text-xs text-[#475569] mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      {metrics.recentOrders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Recent Orders</h3>
          <div className="space-y-2">
            {metrics.recentOrders.map(o => (
              <div key={o.id} className="flex items-center justify-between bg-[#1a2332] border border-[#2a3a55] rounded-xl px-4 py-3">
                <div>
                  <span className="font-mono text-xs text-[#3b82f6] font-bold">{o.orderNumber}</span>
                  <p className="text-xs text-[#475569] mt-0.5">{o.contactName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${STATUS_COLORS[o.status] ?? ""}`}>{o.status}</span>
                  <span className="text-sm font-bold text-white">{jmd(o.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ADD / EDIT PRODUCT MODAL
══════════════════════════════════════════════════════════ */
type ProductForm = {
  name: string; description: string; category: string; sku: string; brand: string;
  price: string; costPrice: string; imageEmoji: string; stockCount: string;
  lowStockThreshold: string; productType: string; supplierId: string; isActive: boolean;
};

const BLANK_FORM: ProductForm = {
  name: "", description: "", category: "", sku: "", brand: "",
  price: "", costPrice: "", imageEmoji: "📦", stockCount: "100",
  lowStockThreshold: "5", productType: "simple", supplierId: "", isActive: true,
};

function ProductModal({
  product, suppliers, onClose, onSaved,
}: {
  product: Product | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [form, setForm] = useState<ProductForm>(product ? {
    name: product.name,
    description: product.description,
    category: product.category,
    sku: product.sku ?? "",
    brand: product.brand ?? "",
    price: String(product.price),
    costPrice: product.costPrice !== null ? String(product.costPrice) : "",
    imageEmoji: product.imageEmoji,
    stockCount: String(product.stockCount),
    lowStockThreshold: String(product.lowStockThreshold),
    productType: product.productType,
    supplierId: product.supplierId !== null ? String(product.supplierId) : "",
    isActive: product.isActive,
  } : BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof ProductForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim() || !form.category.trim() || !form.price) {
      setError("Name, category and price are required."); return;
    }
    setSaving(true); setError("");
    try {
      const url = product ? `/api/store/admin/products/${product.id}` : "/api/store/admin/products";
      const method = product ? "PATCH" : "POST";
      const res = await saFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) { const e = await res.json(); setError(e.error ?? "Save failed"); return; }
      const saved = await res.json();
      onSaved(saved);
    } catch { setError("Network error"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <h3 className="font-bold text-white">{product ? "Edit Product" : "New Product"}</h3>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Product Name *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Category *</label>
              <input value={form.category} onChange={e => set("category", e.target.value)}
                placeholder="e.g. hardware" list="categories-list"
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Product Type</label>
              <select value={form.productType} onChange={e => set("productType", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none">
                {PRODUCT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">SKU</label>
              <input value={form.sku} onChange={e => set("sku", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Brand</label>
              <input value={form.brand} onChange={e => set("brand", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Price (JMD) *</label>
              <input type="number" value={form.price} onChange={e => set("price", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Cost Price (JMD)</label>
              <input type="number" value={form.costPrice} onChange={e => set("costPrice", e.target.value)}
                placeholder="Optional"
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Stock Qty</label>
              <input type="number" value={form.stockCount} onChange={e => set("stockCount", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Low Stock Alert</label>
              <input type="number" value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Emoji Icon</label>
              <input value={form.imageEmoji} onChange={e => set("imageEmoji", e.target.value)} maxLength={4}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none text-2xl" />
            </div>
            <div>
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Supplier</label>
              <select value={form.supplierId} onChange={e => set("supplierId", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none">
                <option value="">— None —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Description</label>
              <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none resize-none" />
            </div>
            <div className="col-span-2 flex items-center gap-3">
              <button type="button" onClick={() => set("isActive", !form.isActive)} className="inline-flex">
                {form.isActive ? <ToggleRight size={24} className="text-emerald-400" /> : <ToggleLeft size={24} className="text-[#475569]" />}
              </button>
              <span className="text-sm text-[#94a3b8]">Product {form.isActive ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
            {saving ? "Saving…" : product ? "Save Changes" : "Create Product"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#2a3a55] text-[#94a3b8] hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   STOCK ADJUST MODAL
══════════════════════════════════════════════════════════ */
function StockAdjustModal({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: (newStock: number) => void }) {
  const [type, setType] = useState("adjustment");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const delta = parseInt(qty);
    if (isNaN(delta) || delta === 0) { setError("Enter a non-zero quantity."); return; }
    setSaving(true); setError("");
    try {
      const res = await saFetch(`/api/store/admin/products/${product.id}/stock-adjust`, {
        method: "POST",
        body: JSON.stringify({ type, quantity: delta, notes, reference }),
      });
      if (!res.ok) { const e = await res.json(); setError(e.error ?? "Failed"); return; }
      const { newStock } = await res.json();
      onDone(newStock);
    } catch { setError("Network error"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <h3 className="font-bold text-white">Adjust Stock — {product.name}</h3>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
          <div className="bg-[#0f1729] rounded-xl p-3 text-center">
            <p className="text-xs text-[#475569] mb-1">Current Stock</p>
            <p className="text-2xl font-bold text-white">{product.stockCount === 9999 ? "∞" : product.stockCount}</p>
          </div>
          <div>
            <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Movement Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none">
              {MOVEMENT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Quantity (+ to add, − to remove)</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="e.g. 10 or -5"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
          </div>
          <div>
            <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Reference (PO#, etc.)</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
          </div>
          <div>
            <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] text-white font-semibold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Apply Adjustment"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#2a3a55] text-[#94a3b8] hover:text-white text-sm transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   PRODUCTS TAB
══════════════════════════════════════════════════════════ */
function ProductsSection({ suppliers }: { suppliers: Supplier[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [editModal, setEditModal] = useState<Product | null | "new">(null);
  const [adjustModal, setAdjustModal] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/products").then(r => r.json()).then(setProducts).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = ["all", ...Array.from(new Set(products.map(p => p.category))).sort()];

  const filtered = products.filter(p => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (stockFilter === "low" && !(p.inStock && p.stockCount > 0 && p.stockCount <= p.lowStockThreshold)) return false;
    if (stockFilter === "out" && p.inStock && p.stockCount > 0) return false;
    if (stockFilter === "in" && (!p.inStock || p.stockCount === 0)) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    }
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };
  const toggleOne = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  async function applyBulkAction() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const body: Record<string, unknown> = { action: bulkAction, ids };
    if (bulkAction === "price") body.value = parseFloat(bulkPrice);
    await saFetch("/api/store/admin/products/bulk", { method: "POST", body: JSON.stringify(body) });
    setSelected(new Set()); setBulkAction(""); setBulkPrice("");
    load();
  }

  async function deleteProduct(id: number) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    setDeleting(id);
    await saFetch(`/api/store/admin/products/${id}`, { method: "DELETE" });
    setProducts(prev => prev.filter(p => p.id !== id));
    setDeleting(null);
  }

  function stockStatus(p: Product) {
    if (!p.inStock || p.stockCount === 0) return { label: "Out", cls: "border-red-500/30 text-red-400 bg-red-500/10" };
    if (p.stockCount <= p.lowStockThreshold) return { label: "Low", cls: "border-amber-500/30 text-amber-400 bg-amber-500/10" };
    return { label: "In Stock", cls: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" };
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2">
          <Search size={13} className="text-[#475569] shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            className="flex-1 bg-transparent text-sm text-white placeholder-[#475569] outline-none" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#94a3b8] focus:border-[#3b82f6] outline-none">
          {categories.map(c => <option key={c} value={c} className="capitalize">{c === "all" ? "All Categories" : c.replace("_", " ")}</option>)}
        </select>
        <select value={stockFilter} onChange={e => setStockFilter(e.target.value)}
          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#94a3b8] focus:border-[#3b82f6] outline-none">
          <option value="all">All Stock</option>
          <option value="in">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a2332] border border-[#2a3a55] text-[#94a3b8] text-xs hover:text-white hover:border-[#3b82f6] transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
        <button onClick={() => setEditModal("new")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb] transition-colors">
          <Plus size={15} /> New Product
        </button>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-[#3b82f6]/10 border border-[#3b82f6]/30 rounded-xl px-4 py-2.5">
          <span className="text-sm text-[#3b82f6] font-semibold">{selected.size} selected</span>
          <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
            className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#3b82f6] outline-none">
            <option value="">Bulk Action…</option>
            <option value="activate">Activate</option>
            <option value="deactivate">Deactivate</option>
            <option value="price">Set Price…</option>
          </select>
          {bulkAction === "price" && (
            <input type="number" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} placeholder="New price JMD"
              className="w-32 bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-sm text-white focus:border-[#3b82f6] outline-none" />
          )}
          {bulkAction && (
            <button onClick={applyBulkAction} className="px-3 py-1.5 rounded-lg bg-[#3b82f6] text-white text-xs font-semibold">Apply</button>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[#475569] hover:text-white text-xs">Clear</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto" /></div>
      ) : (
        <div className="rounded-xl border border-[#2a3a55] overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-[#1a2332] border-b border-[#2a3a55]">
                <th className="px-3 py-3 text-left w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#3b82f6]" />
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Product</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Price</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden lg:table-cell">Cost / Margin</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Stock</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Status</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const ss = stockStatus(p);
                const mgn = margin(p.price, p.costPrice);
                return (
                  <tr key={p.id} className={`border-b border-[#2a3a55] hover:bg-[#1a2332]/60 transition-colors ${selected.has(p.id) ? "bg-[#3b82f6]/5" : ""}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} className="accent-[#3b82f6]" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none shrink-0">{p.imageEmoji}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-white leading-tight truncate max-w-[180px]">{p.name}</p>
                          <p className="text-[11px] text-[#475569]">{p.brand && `${p.brand} · `}{p.sku ?? "—"}</p>
                          <span className="text-[10px] text-[#475569] capitalize">{p.category.replace("_", " ")}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-white font-mono text-xs">{jmd(p.price)}</span>
                    </td>
                    <td className="px-3 py-3 text-right hidden lg:table-cell">
                      {p.costPrice !== null ? (
                        <div>
                          <p className="text-[#94a3b8] font-mono text-xs">{jmd(p.costPrice)}</p>
                          {mgn && <p className="text-emerald-400 text-[10px]">{mgn}% margin</p>}
                        </div>
                      ) : <span className="text-[#475569] text-xs">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-white text-xs font-mono">{p.stockCount >= 9999 ? "∞" : p.stockCount}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${ss.cls}`}>{ss.label}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => {
                        const patch = { isActive: !p.isActive };
                        saFetch(`/api/store/admin/products/${p.id}`, { method: "PATCH", body: JSON.stringify(patch) })
                          .then(r => r.json()).then(u => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, ...u } : x)));
                      }}>
                        {p.isActive ? <ToggleRight size={22} className="text-emerald-400" /> : <ToggleLeft size={22} className="text-[#475569]" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setAdjustModal(p)}
                          title="Adjust Stock"
                          className="p-1.5 rounded-lg bg-[#1a2332] text-[#475569] hover:text-amber-400 border border-[#2a3a55] hover:border-amber-500/30 transition-colors">
                          <ArrowUp size={12} />
                        </button>
                        <button onClick={() => setEditModal(p)}
                          title="Edit"
                          className="p-1.5 rounded-lg bg-[#1a2332] text-[#475569] hover:text-[#3b82f6] border border-[#2a3a55] hover:border-[#3b82f6] transition-colors">
                          <Pencil size={12} />
                        </button>
                        <button onClick={() => deleteProduct(p.id)} disabled={deleting === p.id}
                          title="Delete"
                          className="p-1.5 rounded-lg bg-[#1a2332] text-[#475569] hover:text-red-400 border border-[#2a3a55] hover:border-red-500/30 transition-colors disabled:opacity-40">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="py-10 text-center text-[#475569] text-sm">No products found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editModal !== null && (
        <ProductModal
          product={editModal === "new" ? null : editModal}
          suppliers={suppliers}
          onClose={() => setEditModal(null)}
          onSaved={(saved) => {
            if (editModal === "new") setProducts(prev => [saved, ...prev]);
            else setProducts(prev => prev.map(p => p.id === saved.id ? { ...p, ...saved } : p));
            setEditModal(null);
          }}
        />
      )}
      {adjustModal && (
        <StockAdjustModal
          product={adjustModal}
          onClose={() => setAdjustModal(null)}
          onDone={(newStock) => {
            setProducts(prev => prev.map(p => p.id === adjustModal.id ? { ...p, stockCount: newStock, inStock: newStock > 0 } : p));
            setAdjustModal(null);
          }}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   INVENTORY TAB
══════════════════════════════════════════════════════════ */
function InventorySection() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/stock-movements").then(r => r.json()).then(setMovements).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const typeColors: Record<string, string> = {
    purchase:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    adjustment: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    sale:       "bg-purple-500/15 text-purple-400 border-purple-500/30",
    return:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Stock Movements Log</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-white border border-[#2a3a55] px-3 py-1.5 rounded-lg transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto" /></div>
      ) : movements.length === 0 ? (
        <div className="py-12 text-center text-[#475569] text-sm">No stock movements recorded yet. Adjust stock on a product to begin tracking.</div>
      ) : (
        <div className="rounded-xl border border-[#2a3a55] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1a2332] border-b border-[#2a3a55]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Type</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Change</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden md:table-cell">Before → After</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden lg:table-cell">Reference / Notes</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(({ movement: m, productName, productSku }) => (
                <tr key={m.id} className="border-b border-[#2a3a55] hover:bg-[#1a2332]/60 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white text-xs">{productName ?? `Product #${m.productId}`}</p>
                    {productSku && <p className="text-[11px] text-[#475569]">{productSku}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${typeColors[m.type] ?? "bg-[#1a2332] text-[#94a3b8] border-[#2a3a55]"}`}>{m.type}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono font-bold text-sm ${m.quantity >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {m.quantity >= 0 ? "+" : ""}{m.quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className="text-[#475569] font-mono text-xs">{m.previousStock} → {m.newStock}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <p className="text-[#94a3b8] text-xs">{m.reference && <span className="font-mono text-[#3b82f6]">{m.reference} </span>}{m.notes}</p>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span className="text-[#475569] text-xs">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ORDERS TAB
══════════════════════════════════════════════════════════ */
function OrdersSection() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/orders").then(r => r.json()).then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function update(id: number, patch: Record<string, unknown>) {
    setUpdatingId(id);
    try {
      const res = await saFetch(`/api/store/admin/orders/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o));
      }
    } finally { setUpdatingId(null); }
  }

  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (payFilter !== "all" && o.paymentStatus !== payFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {["all", ...ORDER_STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${statusFilter === s ? "bg-[#3b82f6] border-[#3b82f6] text-white" : "bg-[#1a2332] border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6] hover:text-white"}`}>
              {s === "all" ? "All" : s}{s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
            </button>
          ))}
        </div>
        <select value={payFilter} onChange={e => setPayFilter(e.target.value)}
          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-xs text-[#94a3b8] focus:border-[#3b82f6] outline-none">
          <option value="all">All Payments</option>
          {PAYMENT_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a2332] border border-[#2a3a55] text-[#94a3b8] text-xs hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#475569] text-sm">No orders found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const isExpanded = expandedId === o.id;
            const items = (o.items as Order["items"]) ?? [];
            return (
              <div key={o.id} className="rounded-xl border border-[#2a3a55] bg-[#1a2332]/40 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setExpandedId(isExpanded ? null : o.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <ChevronDown size={14} className={`text-[#475569] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#3b82f6]">{o.orderNumber}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${STATUS_COLORS[o.status] ?? ""}`}>{o.status}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${PAY_COLORS[o.paymentStatus] ?? ""}`}>{o.paymentStatus}</span>
                      </div>
                      <p className="text-xs text-[#94a3b8] truncate mt-0.5">{o.contactName} · {o.contactPhone}</p>
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{jmd(o.total)}</p>
                    <p className="text-[11px] text-[#475569]">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <select value={o.status} onChange={e => update(o.id, { status: e.target.value })} disabled={updatingId === o.id}
                      className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none">
                      {ORDER_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                    <select value={o.paymentStatus} onChange={e => update(o.id, { paymentStatus: e.target.value })} disabled={updatingId === o.id}
                      className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none">
                      {PAYMENT_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                    </select>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[#2a3a55] px-4 py-3 space-y-3 bg-[#0f1729]/40">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Delivery Address</p>
                        <p className="text-[#94a3b8]">{o.deliveryAddress}</p>
                      </div>
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Payment</p>
                        <select value={o.paymentMethod ?? ""} onChange={e => update(o.id, { paymentMethod: e.target.value || null })} disabled={updatingId === o.id}
                          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none w-full">
                          <option value="">— Select Method —</option>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Amount Paid</p>
                        <div className="flex items-center gap-2">
                          <input type="number" defaultValue={o.amountPaid} onBlur={e => update(o.id, { amountPaid: parseFloat(e.target.value) || 0 })}
                            className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none w-28" />
                          <span className="text-[#475569]">of {jmd(o.total)}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Assigned To</p>
                        <input defaultValue={o.fulfillmentAssignee ?? ""} onBlur={e => update(o.id, { fulfillmentAssignee: e.target.value || null })} placeholder="Assignee…"
                          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none w-full" />
                      </div>
                      {o.notes && (
                        <div className="col-span-2">
                          <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Notes</p>
                          <p className="text-[#94a3b8]">{o.notes}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-2">Order Items</p>
                      <div className="space-y-1.5">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-[#94a3b8] text-xs">{item.name} <span className="text-[#475569]">× {item.qty}</span></span>
                            <span className="text-white text-xs font-mono">{jmd(item.price * item.qty)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1.5 border-t border-[#2a3a55]">
                          <span className="text-[#94a3b8] text-xs font-semibold">Total</span>
                          <span className="text-white text-xs font-bold font-mono">{jmd(o.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   SUPPLIERS TAB
══════════════════════════════════════════════════════════ */
function SuppliersSection({ onSuppliersChange }: { onSuppliersChange: (suppliers: Supplier[]) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ name: "", contactName: "", contactPhone: "", email: "", website: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/suppliers").then(r => r.json()).then(data => { setSuppliers(data); onSuppliersChange(data); }).catch(() => {}).finally(() => setLoading(false));
  }, [onSuppliersChange]);

  useEffect(() => { load(); }, [load]);

  function openNew() { setForm({ name: "", contactName: "", contactPhone: "", email: "", website: "", address: "", notes: "" }); setEditId("new"); }
  function openEdit(s: Supplier) { setForm({ name: s.name, contactName: s.contactName ?? "", contactPhone: s.contactPhone ?? "", email: s.email ?? "", website: s.website ?? "", address: s.address ?? "", notes: s.notes ?? "" }); setEditId(s.id); }

  async function saveSupplier() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editId === "new" ? "/api/store/admin/suppliers" : `/api/store/admin/suppliers/${editId}`;
      const method = editId === "new" ? "POST" : "PATCH";
      const res = await saFetch(url, { method, body: JSON.stringify(form) });
      const saved = await res.json();
      if (editId === "new") {
        const updated = [saved, ...suppliers];
        setSuppliers(updated); onSuppliersChange(updated);
      } else {
        const updated = suppliers.map(s => s.id === editId ? { ...s, ...saved } : s);
        setSuppliers(updated); onSuppliersChange(updated);
      }
      setEditId(null);
    } finally { setSaving(false); }
  }

  async function deleteSupplier(id: number) {
    if (!confirm("Delete this supplier?")) return;
    await saFetch(`/api/store/admin/suppliers/${id}`, { method: "DELETE" });
    const updated = suppliers.filter(s => s.id !== id);
    setSuppliers(updated); onSuppliersChange(updated);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Suppliers</h2>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#475569] hover:text-white border border-[#2a3a55] px-3 py-1.5 rounded-lg transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb] transition-colors">
            <Plus size={15} /> Add Supplier
          </button>
        </div>
      </div>

      {/* Add/Edit form */}
      {editId !== null && (
        <div className="bg-[#1a2332] border border-[#3b82f6]/40 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-white text-sm">{editId === "new" ? "New Supplier" : "Edit Supplier"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: "Company Name *", key: "name" },
              { label: "Contact Name", key: "contactName" },
              { label: "Phone", key: "contactPhone" },
              { label: "Email", key: "email" },
              { label: "Website", key: "website" },
              { label: "Address", key: "address" },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">{label}</label>
                <input value={(form as Record<string, string>)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none" />
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs text-[#475569] uppercase tracking-wider block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:border-[#3b82f6] outline-none resize-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={saveSupplier} disabled={saving || !form.name.trim()}
              className="px-4 py-2 rounded-lg bg-[#3b82f6] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#2563eb] transition-colors">
              {saving ? "Saving…" : "Save Supplier"}
            </button>
            <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-lg border border-[#2a3a55] text-[#94a3b8] hover:text-white text-sm transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto" /></div>
      ) : suppliers.length === 0 ? (
        <div className="py-12 text-center text-[#475569] text-sm">No suppliers yet. Add one to link with products.</div>
      ) : (
        <div className="grid gap-3">
          {suppliers.map(s => (
            <div key={s.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-[#3b82f6] shrink-0" />
                    <p className="font-semibold text-white text-sm">{s.name}</p>
                    {!s.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a3a55] text-[#475569]">Inactive</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    {s.contactName && <span className="text-xs text-[#94a3b8]"><Users size={10} className="inline mr-0.5" />{s.contactName}</span>}
                    {s.contactPhone && <span className="text-xs text-[#94a3b8]">{s.contactPhone}</span>}
                    {s.email && <span className="text-xs text-[#94a3b8]">{s.email}</span>}
                    {s.address && <span className="text-xs text-[#475569]">{s.address}</span>}
                  </div>
                  {s.notes && <p className="text-xs text-[#475569] mt-1">{s.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(s)}
                    className="p-1.5 rounded-lg bg-[#0f1729] text-[#475569] hover:text-[#3b82f6] border border-[#2a3a55] hover:border-[#3b82f6] transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deleteSupplier(s.id)}
                    className="p-1.5 rounded-lg bg-[#0f1729] text-[#475569] hover:text-red-400 border border-[#2a3a55] hover:border-red-500/30 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════ */
type Section = "overview" | "products" | "inventory" | "orders" | "suppliers";

const SECTIONS: { id: Section; label: string; icon: typeof Package }[] = [
  { id: "overview",   label: "Overview",   icon: BarChart3 },
  { id: "products",   label: "Products",   icon: Package },
  { id: "inventory",  label: "Inventory",  icon: Box },
  { id: "orders",     label: "Orders",     icon: ShoppingBag },
  { id: "suppliers",  label: "Suppliers",  icon: Truck },
];

export function SuperadminStoreTab() {
  const [section, setSection] = useState<Section>("overview");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <img src="/microbooks-pos-logo.png" alt="" className="h-7 w-auto object-contain" />
          MicroBooks POS Store
        </h1>
        <p className="text-[#94a3b8] text-sm mt-1">Product catalogue, inventory, orders & suppliers</p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 mb-6 bg-[#1a2332] rounded-xl p-1 w-fit flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${section === s.id ? "bg-[#3b82f6] text-white shadow" : "text-[#94a3b8] hover:text-white"}`}>
            <s.icon size={15} />
            {s.label}
          </button>
        ))}
      </div>

      {section === "overview"  && <OverviewSection />}
      {section === "products"  && <ProductsSection suppliers={suppliers} />}
      {section === "inventory" && <InventorySection />}
      {section === "orders"    && <OrdersSection />}
      {section === "suppliers" && <SuppliersSection onSuppliersChange={setSuppliers} />}
    </div>
  );
}
