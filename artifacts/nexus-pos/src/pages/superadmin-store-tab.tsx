import { useState, useEffect, useCallback } from "react";
import {
  Package, RefreshCw, Pencil, Check, X, ShoppingBag, ToggleLeft, ToggleRight,
  ChevronDown, Layers, Search,
} from "lucide-react";
import { SUPERADMIN_TOKEN_KEY } from "@/lib/saas-api";

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

type StoreProduct = {
  id: number;
  name: string;
  description: string;
  category: string;
  sku: string | null;
  brand: string | null;
  price: number;
  imageEmoji: string;
  inStock: boolean;
  stockCount: number;
  isActive: boolean;
  sortOrder: number;
};

type StoreOrder = {
  id: number;
  tenantId: number;
  orderNumber: string;
  status: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  tax: number;
  total: number;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  notes: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  shipped:   "bg-purple-500/15 text-purple-400 border-purple-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/30",
};
const STATUS_ORDER = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function formatJMD(n: number) {
  return `J$${n.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ─────────── Products ─────────── */
function ProductsSection() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<StoreProduct>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/products")
      .then(r => r.json())
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveProduct(id: number, patch: Partial<StoreProduct>) {
    setSaving(true);
    try {
      const res = await saFetch(`/api/store/admin/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const updated = await res.json();
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
        setEditId(null);
      }
    } finally { setSaving(false); }
  }

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(products.map(p => p.category))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1">
          <Search size={14} className="text-[#475569] shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…"
            className="flex-1 bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-sm text-white placeholder-[#475569] outline-none focus:border-[#3b82f6]"
          />
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2332] border border-[#2a3a55] text-[#94a3b8] text-xs hover:text-white hover:border-[#3b82f6] transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const n = products.filter(p => p.category === cat).length;
          return (
            <span key={cat} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1a2332] border border-[#2a3a55] text-xs text-[#94a3b8] capitalize">
              <Layers size={11} className="text-[#3b82f6]" />
              {cat} ({n})
            </span>
          );
        })}
      </div>

      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto mb-2" /></div>
      ) : (
        <div className="rounded-xl border border-[#2a3a55] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1a2332] border-b border-[#2a3a55]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Product</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden lg:table-cell">Category</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Price (JMD)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider hidden md:table-cell">Stock</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Active</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-[#475569] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isEditing = editId === p.id;
                return (
                  <tr key={p.id} className="border-b border-[#2a3a55] hover:bg-[#1a2332]/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none">{p.imageEmoji}</span>
                        <div>
                          {isEditing ? (
                            <input
                              value={editDraft.name ?? p.name}
                              onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))}
                              className="bg-[#0f1729] border border-[#3b82f6] rounded px-2 py-0.5 text-sm text-white w-40"
                            />
                          ) : (
                            <p className="font-medium text-white leading-tight">{p.name}</p>
                          )}
                          <p className="text-[11px] text-[#475569]">{p.brand} · {p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="capitalize text-[#94a3b8] text-xs">{p.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editDraft.price ?? p.price}
                          onChange={e => setEditDraft(d => ({ ...d, price: parseFloat(e.target.value) }))}
                          className="bg-[#0f1729] border border-[#3b82f6] rounded px-2 py-0.5 text-sm text-white w-28 text-right"
                        />
                      ) : (
                        <span className="text-white font-mono text-xs">{formatJMD(p.price)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            value={editDraft.stockCount ?? p.stockCount}
                            onChange={e => setEditDraft(d => ({ ...d, stockCount: parseInt(e.target.value) }))}
                            className="bg-[#0f1729] border border-[#3b82f6] rounded px-2 py-0.5 text-sm text-white w-20 text-center"
                          />
                          <button
                            onClick={() => setEditDraft(d => ({ ...d, inStock: !(d.inStock ?? p.inStock) }))}
                            className={`text-xs px-1.5 py-0.5 rounded border ${(editDraft.inStock ?? p.inStock) ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}
                          >
                            {(editDraft.inStock ?? p.inStock) ? "In" : "Out"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-white text-xs font-mono">{p.stockCount >= 9999 ? "∞" : p.stockCount}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${p.inStock ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10"}`}>
                            {p.inStock ? "In Stock" : "Out"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => {
                          if (!isEditing) saveProduct(p.id, { isActive: !p.isActive });
                          else setEditDraft(d => ({ ...d, isActive: !(d.isActive ?? p.isActive) }));
                        }}
                        title={p.isActive ? "Deactivate" : "Activate"}
                        className="inline-flex"
                      >
                        {(isEditing ? (editDraft.isActive ?? p.isActive) : p.isActive) ? (
                          <ToggleRight size={22} className="text-emerald-400" />
                        ) : (
                          <ToggleLeft size={22} className="text-[#475569]" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveProduct(p.id, editDraft)}
                            disabled={saving}
                            className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                            title="Save"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => { setEditId(null); setEditDraft({}); }}
                            className="p-1.5 rounded-lg bg-[#1a2332] text-[#475569] hover:text-white border border-[#2a3a55] transition-colors"
                            title="Cancel"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditId(p.id); setEditDraft({}); }}
                          className="p-1.5 rounded-lg bg-[#1a2332] text-[#475569] hover:text-[#3b82f6] border border-[#2a3a55] hover:border-[#3b82f6] transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-[#475569] text-sm">No products found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────── Orders ─────────── */
function OrdersSection() {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(() => {
    setLoading(true);
    saFetch("/api/store/admin/orders")
      .then(r => r.json())
      .then(setOrders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      const res = await saFetch(`/api/store/admin/orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o));
      }
    } finally { setUpdatingId(null); }
  }

  const filtered = statusFilter === "all" ? orders : orders.filter(o => o.status === statusFilter);
  const counts: Record<string, number> = {};
  for (const o of orders) counts[o.status] = (counts[o.status] ?? 0) + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        {/* Status filter */}
        <div className="flex flex-wrap gap-1.5">
          {["all", ...STATUS_ORDER].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                statusFilter === s
                  ? "bg-[#3b82f6] border-[#3b82f6] text-white"
                  : "bg-[#1a2332] border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6] hover:text-white"
              }`}
            >
              {s === "all" ? "All" : s}
              {s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2332] border border-[#2a3a55] text-[#94a3b8] text-xs hover:text-white hover:border-[#3b82f6] transition-colors">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-[#475569]"><RefreshCw size={18} className="animate-spin mx-auto mb-2" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#475569] text-sm">No orders found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(o => {
            const isExpanded = expandedId === o.id;
            const items = (o.items as StoreOrder["items"]) ?? [];
            return (
              <div key={o.id} className="rounded-xl border border-[#2a3a55] bg-[#1a2332]/40 overflow-hidden">
                {/* Order header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <ChevronDown size={14} className={`text-[#475569] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#3b82f6]">{o.orderNumber}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${STATUS_COLORS[o.status] ?? "bg-[#1a2332] text-[#94a3b8] border-[#2a3a55]"}`}>{o.status}</span>
                      </div>
                      <p className="text-xs text-[#94a3b8] truncate mt-0.5">{o.contactName} · {o.contactPhone}</p>
                    </div>
                  </button>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-white">{formatJMD(o.total)}</p>
                    <p className="text-[11px] text-[#475569]">{new Date(o.createdAt).toLocaleDateString()}</p>
                  </div>
                  {/* Status updater */}
                  <select
                    value={o.status}
                    onChange={e => updateStatus(o.id, e.target.value)}
                    disabled={updatingId === o.id}
                    className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-2 py-1 text-xs text-white focus:border-[#3b82f6] outline-none shrink-0"
                  >
                    {STATUS_ORDER.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-[#2a3a55] px-4 py-3 space-y-3 bg-[#0f1729]/40">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Delivery Address</p>
                        <p className="text-[#94a3b8]">{o.deliveryAddress}</p>
                      </div>
                      {o.notes && (
                        <div>
                          <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Notes</p>
                          <p className="text-[#94a3b8]">{o.notes}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-1">Tenant ID</p>
                        <p className="text-[#94a3b8] font-mono">{o.tenantId}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[#475569] uppercase tracking-wider text-[10px] mb-2">Order Items</p>
                      <div className="space-y-1.5">
                        {items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-[#94a3b8] text-xs">{item.name} <span className="text-[#475569]">× {item.qty}</span></span>
                            <span className="text-white text-xs font-mono">{formatJMD(item.price * item.qty)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between pt-1.5 border-t border-[#2a3a55]">
                          <span className="text-[#94a3b8] text-xs font-semibold">Total</span>
                          <span className="text-white text-xs font-bold font-mono">{formatJMD(o.total)}</span>
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

/* ─────────── Main Export ─────────── */
export function SuperadminStoreTab() {
  const [section, setSection] = useState<"products" | "orders">("orders");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <img src="/microbooks-pos-logo.png" alt="MicroBooks POS Store" className="h-7 w-auto object-contain" />
          MicroBooks POS Store
        </h1>
        <p className="text-[#94a3b8] text-sm mt-1">Manage store products and customer orders</p>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 mb-6 bg-[#1a2332] rounded-xl p-1 w-fit">
        <button
          onClick={() => setSection("orders")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === "orders" ? "bg-[#3b82f6] text-white shadow" : "text-[#94a3b8] hover:text-white"
          }`}
        >
          <ShoppingBag size={15} />
          Orders
        </button>
        <button
          onClick={() => setSection("products")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === "products" ? "bg-[#3b82f6] text-white shadow" : "text-[#94a3b8] hover:text-white"
          }`}
        >
          <Package size={15} />
          Products
        </button>
      </div>

      {section === "products" && <ProductsSection />}
      {section === "orders" && <OrdersSection />}
    </div>
  );
}
