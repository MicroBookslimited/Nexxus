import { useState, useEffect } from "react";
import "./index.css";

const BASE_URL = import.meta.env.BASE_URL;

const POS_URL = "/app/";

// ─── Icons ────────────────────────────────────────────────────────────────────
function Icon({ name, cls = "", style }: { name: string; cls?: string; style?: React.CSSProperties }) {
  const icons: Record<string, React.ReactNode> = {
    zap: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    layout: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    ),
    bar_chart: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    ),
    users: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    shield: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    wifi: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <path d="M5 12.55a11 11 0 0 1 14.08 0" /><path d="M1.42 9a16 16 0 0 1 21.16 0" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><circle cx="12" cy="20" r="1" fill="currentColor" />
      </svg>
    ),
    printer: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
      </svg>
    ),
    credit_card: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    utensils: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3z" />
      </svg>
    ),
    package: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
    check: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={cls} style={style}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    arrow_right: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
      </svg>
    ),
    star: (
      <svg viewBox="0 0 24 24" fill="currentColor" className={cls} style={style}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    globe: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    menu: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
    x: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
    chevron_down: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    ),
    monitor: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    smartphone: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeLinecap="round" strokeWidth="3" />
      </svg>
    ),
    mail: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
      </svg>
    ),
    trending_up: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls} style={style}>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  };
  return <>{icons[name] ?? null}</>;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const links = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "Hardware", href: "#hardware" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(15,23,41,0.95)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(59,130,246,0.12)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        <a href="#" className="flex items-center gap-2 text-lg font-bold">
          <span className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center text-white text-sm font-bold">
            N
          </span>
          <span className="text-white">Nexus <span style={{ color: "#3b82f6" }}>POS</span></span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium transition-colors"
              style={{ color: "#94a3b8" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#f1f5f9")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a href={POS_URL} className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ color: "#94a3b8" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f1f5f9")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
          >
            Sign In
          </a>
          <a href={`${POS_URL}signup`}
            className="text-sm font-semibold px-5 py-2 rounded-lg text-white gradient-blue transition-all hover:opacity-90 hover:shadow-lg"
          >
            Start Free Trial
          </a>
        </div>

        <button className="md:hidden p-2 rounded-lg" style={{ color: "#94a3b8" }} onClick={() => setOpen(!open)}>
          <Icon name={open ? "x" : "menu"} cls="w-5 h-5" />
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t px-6 py-4 flex flex-col gap-4"
          style={{ background: "rgba(15,23,41,0.98)", borderColor: "rgba(59,130,246,0.12)" }}
        >
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium" style={{ color: "#94a3b8" }} onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          <a href={`${POS_URL}signup`}
            className="text-sm font-semibold px-5 py-2.5 rounded-lg text-white text-center gradient-blue"
            onClick={() => setOpen(false)}
          >
            Start Free Trial
          </a>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative pt-32 pb-24 px-6 overflow-hidden hero-glow" id="hero">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
      }} />
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none" style={{
        background: "radial-gradient(ellipse, rgba(59,130,246,0.18) 0%, transparent 70%)",
        filter: "blur(40px)",
      }} />

      <div className="relative max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
          style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa" }}
        >
          <Icon name="zap" cls="w-3.5 h-3.5" />
          Trusted by 2,400+ businesses across the Caribbean &amp; Americas
        </div>

        <h1 className="text-5xl md:text-7xl font-black leading-none tracking-tight mb-6">
          <span className="text-white">Your Business,</span>
          <br />
          <span className="gradient-text">Connected.</span>
        </h1>

        <p className="text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style={{ color: "#94a3b8" }}>
          Nexus POS is the all-in-one tablet point-of-sale built for restaurants, retail, and service businesses.
          Sell faster, manage smarter, grow further — all from one beautiful dashboard.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a href={`${POS_URL}signup`}
            className="flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white gradient-blue text-base hover:opacity-90 transition-all"
            style={{ boxShadow: "0 0 40px rgba(59,130,246,0.3)" }}
          >
            Start Free 14-Day Trial
            <Icon name="arrow_right" cls="w-4 h-4" />
          </a>
          <a href="#how-it-works"
            className="flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#f1f5f9" }}
          >
            See How It Works
          </a>
        </div>

        <div className="inline-grid grid-cols-3 gap-px rounded-2xl overflow-hidden"
          style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.15)" }}
        >
          {[
            { value: "2,400+", label: "Active Businesses" },
            { value: "$42M+", label: "Processed Monthly" },
            { value: "99.9%", label: "Uptime SLA" },
          ].map((s) => (
            <div key={s.label} className="px-8 py-5" style={{ background: "rgba(15,23,41,0.6)" }}>
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-xs mt-1" style={{ color: "#64748b" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Mock POS screenshot */}
      <div className="relative max-w-5xl mx-auto mt-16">
        <div className="rounded-2xl overflow-hidden" style={{
          background: "rgba(17,25,40,0.9)",
          border: "1px solid rgba(59,130,246,0.2)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>
          {/* Browser bar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ background: "rgba(15,23,41,0.8)", borderColor: "rgba(59,130,246,0.12)" }}
          >
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#ffbd2e" }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
            </div>
            <div className="flex-1 mx-4 px-3 py-1 rounded-md text-xs text-center"
              style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}
            >
              nexuspos.app · Point of Sale
            </div>
          </div>
          {/* POS UI mockup */}
          <div className="grid grid-cols-5 min-h-[320px]">
            <div className="col-span-1 border-r p-4 flex flex-col gap-2"
              style={{ borderColor: "rgba(59,130,246,0.1)", background: "rgba(10,15,28,0.6)" }}
            >
              {["Dashboard", "Orders", "Products", "Customers", "Reports"].map((item, i) => (
                <div key={item} className="px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: i === 1 ? "rgba(59,130,246,0.2)" : "transparent", color: i === 1 ? "#60a5fa" : "#475569" }}
                >
                  {item}
                </div>
              ))}
            </div>
            <div className="col-span-2 p-4 border-r" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
              <div className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>MENU</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Burger", price: "$12.99", emoji: "🍔" },
                  { name: "Pizza", price: "$14.99", emoji: "🍕" },
                  { name: "Salad", price: "$8.99", emoji: "🥗" },
                  { name: "Soda", price: "$2.99", emoji: "🥤" },
                  { name: "Coffee", price: "$4.50", emoji: "☕" },
                  { name: "Fries", price: "$3.99", emoji: "🍟" },
                ].map((p) => (
                  <div key={p.name} className="p-3 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="text-base mb-1">{p.emoji}</div>
                    <div className="text-xs font-medium text-white">{p.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#60a5fa" }}>{p.price}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-2 p-4 flex flex-col" style={{ background: "rgba(10,15,28,0.4)" }}>
              <div className="text-xs font-semibold mb-3" style={{ color: "#64748b" }}>ORDER #1042</div>
              <div className="flex-1 flex flex-col gap-2">
                {[
                  { name: "Burger x2", price: "$25.98" },
                  { name: "Fries x1", price: "$3.99" },
                  { name: "Coffee x1", price: "$4.50" },
                ].map((item) => (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <span style={{ color: "#cbd5e1" }}>{item.name}</span>
                    <span style={{ color: "#f1f5f9" }}>{item.price}</span>
                  </div>
                ))}
              </div>
              <div className="border-t pt-3 mt-3" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
                <div className="flex justify-between text-sm font-bold text-white mb-3">
                  <span>Total</span>
                  <span style={{ color: "#60a5fa" }}>$34.47</span>
                </div>
                <div className="w-full py-2 rounded-lg text-center text-xs font-semibold text-white gradient-blue">
                  Charge $34.47
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating badges */}
        <div className="absolute -left-4 top-16 glass-card rounded-xl px-4 py-3 hidden md:flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)" }}>
            <Icon name="trending_up" cls="w-4 h-4" style={{ color: "#22c55e" }} />
          </div>
          <div>
            <div className="text-xs font-bold text-white">+34% Revenue</div>
            <div className="text-xs" style={{ color: "#64748b" }}>vs last month</div>
          </div>
        </div>
        <div className="absolute -right-4 bottom-16 glass-card rounded-xl px-4 py-3 hidden md:flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(59,130,246,0.2)" }}>
            <Icon name="zap" cls="w-4 h-4" style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <div className="text-xs font-bold text-white">2.3s avg checkout</div>
            <div className="text-xs" style={{ color: "#64748b" }}>Blazing fast POS</div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Trust Bar ────────────────────────────────────────────────────────────────
function TrustBar() {
  const brands = [
    "The Coral Café", "Island Retail Co.", "Sapphire Bistro", "TradeWind Markets",
    "Blue Lagoon Bar", "Prism Boutique", "Harborside Grill", "The Spice Route",
  ];
  return (
    <section className="py-12 border-y" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
      <div className="max-w-7xl mx-auto px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest mb-8" style={{ color: "#475569" }}>
          Trusted by businesses across the region
        </p>
        <div className="overflow-hidden relative">
          <div className="flex gap-12 items-center"
            style={{ animation: "ticker 30s linear infinite", whiteSpace: "nowrap" }}
          >
            {[...brands, ...brands].map((b, i) => (
              <span key={i} className="text-sm font-semibold shrink-0" style={{ color: "#334155" }}>{b}</span>
            ))}
          </div>
        </div>
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function Features() {
  const features = [
    { icon: "layout", title: "Intuitive POS Interface", desc: "Tablet-first design your staff will love. Process orders in seconds with a zero-learning-curve interface.", color: "#3b82f6" },
    { icon: "utensils", title: "Table & Kitchen Management", desc: "Live table maps, kitchen display system (KDS), course firing, and instant order routing — built for full-service restaurants.", color: "#8b5cf6" },
    { icon: "bar_chart", title: "Real-Time Analytics", desc: "Revenue by hour, category, staff, and payment method. End-of-day reports, CSV exports, and low-stock alerts.", color: "#22c55e" },
    { icon: "users", title: "Customer Loyalty", desc: "Build customer profiles, track order history, send receipts by email, and reward your best guests automatically.", color: "#f97316" },
    { icon: "package", title: "Inventory Control", desc: "Track stock levels in real time. Get alerted before you run out. Record purchase bills and stock receipts with ease.", color: "#ec4899" },
    { icon: "shield", title: "Role-Based Access", desc: "PIN-protected staff logins. Cashier, manager, and kitchen roles with granular permissions per screen and action.", color: "#14b8a6" },
    { icon: "credit_card", title: "Flexible Payments", desc: "Cash, card (PowerTranz), PayPal, and split payments. Manage cash drawers, shifts, and daily float in one place.", color: "#a78bfa" },
    { icon: "printer", title: "80mm Receipt Printing", desc: "One-click thermal receipt printing, kitchen tickets, and end-of-day summary reports — all formatted for 80mm printers.", color: "#fb923c" },
    { icon: "wifi", title: "Works Offline", desc: "Nexus POS keeps running even when your internet drops. All data syncs automatically when you're back online.", color: "#60a5fa" },
  ];

  return (
    <section id="features" className="py-24 px-6 section-glow">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            Everything You Need
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">One platform, every tool</h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: "#64748b" }}>
            From your first sale to your thousandth table — Nexus POS has the features ambitious businesses rely on every day.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div key={f.title} className="glass-card rounded-2xl p-6 card-hover">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${f.color}22` }}
              >
                <Icon name={f.icon} cls="w-5 h-5" style={{ color: f.color }} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: "01", title: "Create your account", desc: "Sign up in under 2 minutes. Choose your plan, set your business type, and you're ready to go.", icon: "globe" },
    { num: "02", title: "Configure your menu", desc: "Add products, categories, variants, and modifiers. Import from a spreadsheet or build inside Nexus.", icon: "package" },
    { num: "03", title: "Set up your team", desc: "Invite staff with role-based PINs. Assign cashier, manager, or kitchen display permissions in seconds.", icon: "users" },
    { num: "04", title: "Start selling", desc: "Open on any tablet or browser. Process orders, manage tables, fire to kitchen, and accept any payment.", icon: "zap" },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            Simple Setup
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Up and running in minutes</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
            No IT team needed. No lengthy implementation. Just a clean onboarding wizard and you're live.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="glass-card rounded-2xl p-6">
              <div className="text-5xl font-black mb-4 leading-none" style={{ color: "rgba(59,130,246,0.15)" }}>{s.num}</div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(59,130,246,0.15)" }}>
                <Icon name={s.icon} cls="w-5 h-5" style={{ color: "#60a5fa" }} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-12">
          <a href={`${POS_URL}signup`}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white gradient-blue text-base hover:opacity-90 transition-all"
          >
            Get Started Now
            <Icon name="arrow_right" cls="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials() {
  const testimonials = [
    { name: "Marcus Laurent", role: "Owner, Sapphire Bistro", text: "We switched from Square last year and our checkout time dropped by half. The kitchen display alone was worth it — no more lost tickets.", rating: 5 },
    { name: "Priya Ramdeen", role: "Manager, TradeWind Markets", text: "The inventory tracking finally gave us visibility into what's actually selling. We cut overstock waste by 30% in the first quarter.", rating: 5 },
    { name: "David Chen", role: "GM, Harborside Grill", text: "Setup took less than a day. My staff picked it up without any training. The analytics dashboard is something we check every morning.", rating: 5 },
    { name: "Sasha Morales", role: "Owner, Prism Boutique", text: "Customer profiles and email receipts have helped us build real relationships with our regulars. Nexus feels like it was built for us.", rating: 5 },
    { name: "James Fitzroy", role: "Operations, Blue Lagoon Bar", text: "Running three tabs per table used to be a nightmare. Now we hold orders, split bills, and charge tables in seconds. Game changer.", rating: 5 },
    { name: "Amara Singh", role: "Owner, The Spice Route", text: "The offline mode saved us during a power outage. We never stopped selling, and everything synced when we came back up. Incredible.", rating: 5 },
  ];

  return (
    <section id="testimonials" className="py-24 px-6" style={{ background: "rgba(0,0,0,0.2)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            Customer Stories
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Loved by real businesses</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
            Don't take our word for it — here's what our customers say after switching to Nexus POS.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div key={t.name} className="glass-card rounded-2xl p-6 flex flex-col gap-4">
              <div className="flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, i) => (
                  <Icon key={i} name="star" cls="w-4 h-4" style={{ color: "#fbbf24" }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1 italic" style={{ color: "#cbd5e1" }}>"{t.text}"</p>
              <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}
                >
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs" style={{ color: "#64748b" }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────
function Pricing() {
  const plans = [
    {
      name: "Starter", price: "$29", period: "/mo",
      desc: "Perfect for single-location small businesses just getting started.",
      features: ["1 terminal / register", "Up to 200 products", "Basic sales reports", "Email receipts", "Cash & card payments", "Email support"],
      cta: "Start Free Trial", highlight: false,
    },
    {
      name: "Professional", price: "$79", period: "/mo",
      desc: "For growing restaurants and retailers who need full feature access.",
      features: ["Up to 5 terminals", "Unlimited products", "Advanced analytics & exports", "Table & kitchen management", "Customer loyalty profiles", "Inventory & purchase bills", "Staff role management", "Priority support"],
      cta: "Start Free Trial", highlight: true,
    },
    {
      name: "Enterprise", price: "$199", period: "/mo",
      desc: "Multi-location chains and high-volume operations.",
      features: ["Unlimited terminals", "Multi-location dashboard", "Custom integrations", "Dedicated account manager", "White-label options", "SLA & uptime guarantee", "Custom reporting", "Phone + priority support"],
      cta: "Contact Sales", highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 px-6 section-glow">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            Simple Pricing
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Plans that grow with you</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
            No hidden fees. No per-transaction cuts. Just flat monthly pricing with a free 14-day trial on every plan.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {plans.map((p) => (
            <div key={p.name} className="rounded-2xl p-7 relative"
              style={{
                background: p.highlight ? "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(139,92,246,0.15))" : "rgba(26,35,50,0.8)",
                border: p.highlight ? "1px solid rgba(59,130,246,0.5)" : "1px solid rgba(59,130,246,0.15)",
                boxShadow: p.highlight ? "0 0 60px rgba(59,130,246,0.15)" : "none",
              }}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white"
                  style={{ background: "linear-gradient(90deg,#3b82f6,#8b5cf6)" }}
                >
                  Most Popular
                </div>
              )}
              <div className="mb-5">
                <div className="text-sm font-semibold mb-1" style={{ color: "#64748b" }}>{p.name}</div>
                <div className="flex items-end gap-1 mb-2">
                  <span className="text-4xl font-black text-white">{p.price}</span>
                  <span className="text-sm pb-1" style={{ color: "#64748b" }}>{p.period}</span>
                </div>
                <p className="text-sm" style={{ color: "#64748b" }}>{p.desc}</p>
              </div>
              <a href={`${POS_URL}signup`}
                className="block w-full py-3 rounded-xl text-center text-sm font-semibold mb-6 transition-all hover:opacity-90"
                style={p.highlight
                  ? { background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff" }
                  : { background: "rgba(255,255,255,0.06)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,0.1)" }
                }
              >
                {p.cta}
              </a>
              <ul className="flex flex-col gap-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: "#cbd5e1" }}>
                    <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "rgba(59,130,246,0.2)" }}
                    >
                      <Icon name="check" cls="w-2.5 h-2.5" style={{ color: "#60a5fa" }} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-center text-sm mt-8" style={{ color: "#475569" }}>
          All plans include a 14-day free trial. No credit card required to start.
        </p>
      </div>
    </section>
  );
}

// ─── Hardware ─────────────────────────────────────────────────────────────────
function Hardware() {
  const items = [
    { icon: "smartphone", title: "iPad / Android Tablet", desc: "Runs beautifully on any modern tablet. No proprietary hardware needed — use what you already have." },
    { icon: "monitor", title: "Touchscreen All-in-One", desc: "Compatible with Windows & Linux touch terminals from Aures, Posiflex, PAX, and Sunmi." },
    { icon: "printer", title: "80mm Thermal Printer", desc: "Works with Epson, Star, and Xprinter series. Auto-cut receipts and kitchen tickets." },
    { icon: "credit_card", title: "Card Terminals", desc: "Integrated with PowerTranz for chip, tap, and swipe. Works alongside your existing terminal." },
    { icon: "wifi", title: "Cash Drawer", desc: "Any standard RJ11 / USB cash drawer. Opens automatically on cash transactions." },
    { icon: "monitor", title: "Customer Display", desc: "Optional second screen to show order totals and promotional content during checkout." },
  ];

  return (
    <section id="hardware" className="py-24 px-6" style={{ background: "rgba(0,0,0,0.15)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            Works With Your Setup
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Supported hardware</h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "#64748b" }}>
            Nexus POS is hardware-agnostic. Bring your existing equipment or buy new — we work with the industry standard brands.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((h) => (
            <div key={h.title} className="glass-card rounded-2xl p-5 flex gap-4 card-hover">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(59,130,246,0.15)" }}
              >
                <Icon name={h.icon} cls="w-6 h-6" style={{ color: "#60a5fa" }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white mb-1">{h.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>{h.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6"
          style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }}
        >
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Need a hardware recommendation?</h3>
            <p className="text-sm" style={{ color: "#64748b" }}>Our team will help you find the right setup for your business size and budget.</p>
          </div>
          <a href="mailto:hello@nexuspos.app"
            className="shrink-0 px-6 py-3 rounded-xl text-sm font-semibold text-white gradient-blue hover:opacity-90 transition-all"
          >
            Talk to an Expert
          </a>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  const faqs = [
    { q: "Do I need to buy special hardware?", a: "No — Nexus POS runs in any modern web browser on tablets, touchscreens, or desktops. You can use hardware you already own. We support standard 80mm thermal printers, cash drawers, and card terminals from all major brands." },
    { q: "Can I use Nexus offline?", a: "Yes. Nexus POS continues to work during internet outages. Orders are queued locally and sync automatically when your connection is restored. You won't lose a single sale." },
    { q: "How long does the free trial last?", a: "Every plan includes a 14-day free trial with no credit card required. You get full access to all features on your chosen plan from day one." },
    { q: "How many staff members can I add?", a: "All plans support unlimited staff accounts. Each staff member gets a unique PIN and role (cashier, manager, or kitchen). Permissions are managed at the plan level, not per user." },
    { q: "Can I manage multiple locations?", a: "Yes — the Enterprise plan includes a multi-location dashboard where you can view sales, inventory, and staff across all your sites from a single login." },
    { q: "What payment methods does Nexus support?", a: "We support cash, card (via PowerTranz integration), PayPal, and split payments. You can also log custom payment types like gift cards or direct transfer." },
    { q: "Is my data secure?", a: "Yes. Nexus POS uses encrypted connections (TLS), hashed staff PINs, and role-based access controls. Data is hosted in a secure cloud environment with regular backups." },
    { q: "Can I import my existing menu/products?", a: "Yes — you can bulk-import products from a CSV file or add them manually inside the product manager. Variants, modifiers, and categories are all fully supported." },
    { q: "How does billing work?", a: "Billing is monthly, charged to your card or PayPal. You can upgrade, downgrade, or cancel at any time from the subscription page inside your account." },
  ];

  return (
    <section id="faq" className="py-24 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}
          >
            FAQ
          </div>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Common questions</h2>
          <p className="text-lg" style={{ color: "#64748b" }}>Everything you need to know before getting started.</p>
        </div>
        <div className="flex flex-col gap-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl overflow-hidden"
              style={{
                background: open === i ? "rgba(59,130,246,0.08)" : "rgba(26,35,50,0.8)",
                border: open === i ? "1px solid rgba(59,130,246,0.3)" : "1px solid rgba(59,130,246,0.1)",
              }}
            >
              <button className="w-full flex items-center justify-between px-5 py-4 text-left" onClick={() => setOpen(open === i ? null : i)}>
                <span className="text-sm font-semibold text-white pr-4">{f.q}</span>
                <Icon name="chevron_down" cls="w-4 h-4 shrink-0 transition-transform"
                  style={{ color: "#60a5fa", transform: open === i ? "rotate(180deg)" : "none" }}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>{f.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────
function CTA() {
  return (
    <section id="contact" className="py-24 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <div className="rounded-3xl p-12 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.12))",
            border: "1px solid rgba(59,130,246,0.25)",
          }}
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse 60% 60% at 50% 0%, rgba(59,130,246,0.25), transparent)" }}
          />
          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-4">Ready to power your business?</h2>
            <p className="text-lg mb-8 max-w-xl mx-auto" style={{ color: "#94a3b8" }}>
              Join thousands of businesses already running on Nexus POS. Start your free 14-day trial today — no credit card, no commitment.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={`${POS_URL}signup`}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-white gradient-blue text-base hover:opacity-90 transition-all"
              >
                Start Free Trial
                <Icon name="arrow_right" cls="w-4 h-4" />
              </a>
              <a href="mailto:hello@nexuspos.app"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", color: "#f1f5f9" }}
              >
                <Icon name="mail" cls="w-4 h-4" />
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    {
      heading: "Product",
      links: [{ label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "Hardware", href: "#hardware" }, { label: "Changelog", href: "#" }],
    },
    {
      heading: "Company",
      links: [{ label: "About", href: "#" }, { label: "Blog", href: "#" }, { label: "Careers", href: "#" }, { label: "Contact", href: "mailto:hello@nexuspos.app" }],
    },
    {
      heading: "Support",
      links: [{ label: "Documentation", href: "#" }, { label: "FAQ", href: "#faq" }, { label: "Status", href: "#" }, { label: "Privacy Policy", href: "#" }],
    },
  ];

  return (
    <footer className="border-t py-16 px-6" style={{ borderColor: "rgba(59,130,246,0.1)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center text-white text-sm font-bold">N</span>
              <span className="font-bold text-white">Nexus POS</span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "#475569" }}>
              Your Business, Connected. The modern tablet POS built for growing businesses.
            </p>
            <p className="text-xs" style={{ color: "#334155" }}>
              Powered by <span style={{ color: "#60a5fa" }}>MicroBooks</span>
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.heading}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>{col.heading}</div>
              <ul className="flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a href={l.href} className="text-sm transition-colors"
                      style={{ color: "#475569" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t"
          style={{ borderColor: "rgba(59,130,246,0.1)" }}
        >
          <p className="text-xs" style={{ color: "#334155" }}>© 2025 Nexus POS by MicroBooks. All rights reserved.</p>
          <div className="flex gap-4 text-xs" style={{ color: "#334155" }}>
            <a href="#" className="hover:text-blue-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-blue-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-blue-400 transition-colors">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div style={{ background: "#0f1729", minHeight: "100vh" }}>
      <Navbar />
      <Hero />
      <TrustBar />
      <Features />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <Hardware />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}
