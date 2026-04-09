import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, ListOrdered, Store, Package, Users, BarChart2,
  Maximize, Minimize, UtensilsCrossed, ChefHat, UserCog, Coins, Settings,
  CreditCard, LogOut, ChevronDown, AlertTriangle, Clock, MapPin, Calculator,
  Menu, X, MoreHorizontal,
} from "lucide-react";
import { ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TENANT_TOKEN_KEY, saasMe } from "@/lib/saas-api";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos",       label: "POS",        icon: ShoppingCart },
  { href: "/tables",   label: "Tables",      icon: UtensilsCrossed },
  { href: "/kitchen",  label: "Kitchen",     icon: ChefHat },
  { href: "/orders",   label: "Orders",      icon: ListOrdered },
  { href: "/cash",     label: "Cash",        icon: Coins },
  { href: "/products", label: "Products",    icon: Package },
  { href: "/customers",label: "Customers",   icon: Users },
  { href: "/staff",    label: "Staff",       icon: UserCog },
  { href: "/locations",label: "Locations",   icon: MapPin },
  { href: "/accounting",label: "Accounting", icon: Calculator },
  { href: "/reports",  label: "Reports",     icon: BarChart2 },
  { href: "/settings", label: "Settings",    icon: Settings },
  { href: "/subscription", label: "Plan",    icon: CreditCard },
];

const MOBILE_PRIMARY = ["/dashboard", "/pos", "/orders", "/products"];

function useCountdown(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!targetDate) { setTimeLeft(null); return; }
    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const timeLeft = useCountdown(expiryDate);

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) return;
    saasMe().then((me) => {
      const sub = me.subscription;
      if (!sub) return;
      let expiry: Date | null = null;
      if (sub.status === "trial" && sub.trialEndsAt) expiry = new Date(sub.trialEndsAt);
      else if (sub.status === "active" && sub.currentPeriodEnd) expiry = new Date(sub.currentPeriodEnd);
      if (expiry) {
        const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
        if (daysLeft <= 15 && daysLeft > 0) setExpiryDate(expiry);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(TENANT_TOKEN_KEY);
    setProfileOpen(false);
    setLocation("/login");
  }, [setLocation]);

  const fsSupported = typeof document.documentElement.requestFullscreen === "function";

  const toggleFullscreen = useCallback(() => {
    if (!fsSupported) return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, [fsSupported]);

  useEffect(() => {
    if (!fsSupported) return;
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [fsSupported]);

  const showBanner = !bannerDismissed && timeLeft !== null && expiryDate !== null;
  const daysLeft = timeLeft ? timeLeft.days : 0;
  const isUrgent = daysLeft <= 3;
  const isWarning = daysLeft <= 7;
  const pad = (n: number) => String(n).padStart(2, "0");

  const mobilePrimary = NAV_ITEMS.filter(i => MOBILE_PRIMARY.includes(i.href));
  const mobileSecondary = NAV_ITEMS.filter(i => !MOBILE_PRIMARY.includes(i.href));

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">

      {/* ── TOP HEADER ───────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5 bg-card">

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Store className="h-4 w-4" />
          </div>
          <div className="leading-tight hidden sm:block">
            <span className="text-sm font-bold tracking-tight">NEXXUS POS</span>
            <span className="text-[10px] text-muted-foreground ml-2 hidden 2xl:inline">Your Business, Connected.</span>
          </div>
          <span className="text-sm font-bold tracking-tight sm:hidden">NEXXUS</span>
        </div>

        {/* ── DESKTOP NAV (≥1280px): icon + label ── */}
        <nav className="hidden xl:flex items-center gap-0 overflow-x-auto no-scrollbar mx-2 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* ── TABLET NAV (768-1279px): icon-only with tooltip ── */}
        <nav className="hidden md:flex xl:hidden items-center gap-0 overflow-x-auto no-scrollbar mx-2 flex-1 justify-center">
          {NAV_ITEMS.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex items-center justify-center w-8 h-9 rounded-md transition-all shrink-0",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                <item.icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>

        {/* ── MOBILE: hamburger button ── */}
        <button
          className="md:hidden flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors ml-1"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          {fsSupported && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground hidden sm:flex"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1.5 hover:bg-secondary/60 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">A</span>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform hidden sm:block", profileOpen && "rotate-180")} />
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-lg border border-border bg-card shadow-xl z-50 overflow-hidden">
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">My Account</p>
                  <p className="text-[10px] text-muted-foreground truncate">Admin</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MOBILE FULL-SCREEN DRAWER ────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div className="relative z-10 flex flex-col w-72 max-w-[85vw] h-full bg-card border-r border-border shadow-2xl">
            {/* Drawer header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Store className="h-3.5 w-3.5" />
                </div>
                <span className="text-sm font-bold tracking-tight">NEXXUS POS</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items */}
            <nav className="flex-1 overflow-y-auto py-3 px-2">
              {NAV_ITEMS.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    )}
                  >
                    <item.icon className="h-4.5 w-4.5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="shrink-0 border-t border-border p-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
              <p className="text-[10px] text-muted-foreground/50 text-center mt-2">Powered by MicroBooks</p>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTION EXPIRY BANNER ───────────────────────── */}
      {showBanner && timeLeft && (
        <div className={cn(
          "shrink-0 flex items-center justify-between px-4 py-2 text-sm border-b",
          isUrgent
            ? "bg-red-500/15 border-red-500/30 text-red-300"
            : isWarning
            ? "bg-orange-500/15 border-orange-500/30 text-orange-300"
            : "bg-amber-500/10 border-amber-500/20 text-amber-300"
        )}>
          <div className="flex items-center gap-2 flex-wrap">
            {isUrgent ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" /> : <Clock className="h-4 w-4 shrink-0" />}
            <span className="font-medium text-xs hidden sm:inline">
              {isUrgent ? "⚠ Plan expiring very soon!" : "Your plan expires in:"}
            </span>
            <div className="flex items-center gap-1 font-mono font-bold tracking-wider text-white">
              <span className={cn("px-1.5 py-0.5 rounded text-xs", isUrgent ? "bg-red-500/20" : "bg-black/20")}>{pad(timeLeft.days)}d</span>
              <span className="text-muted-foreground text-xs">:</span>
              <span className={cn("px-1.5 py-0.5 rounded text-xs", isUrgent ? "bg-red-500/20" : "bg-black/20")}>{pad(timeLeft.hours)}h</span>
              <span className="text-muted-foreground text-xs">:</span>
              <span className={cn("px-1.5 py-0.5 rounded text-xs", isUrgent ? "bg-red-500/20" : "bg-black/20")}>{pad(timeLeft.minutes)}m</span>
              <span className="text-muted-foreground text-xs">:</span>
              <span className={cn("px-1.5 py-0.5 rounded text-xs", isUrgent ? "bg-red-500/20" : "bg-black/20")}>{pad(timeLeft.seconds)}s</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <Link
              href="/subscription"
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-semibold transition-colors",
                isUrgent ? "bg-red-500 hover:bg-red-400 text-white" : "bg-amber-500 hover:bg-amber-400 text-black"
              )}
            >
              Renew
            </Link>
            <button onClick={() => setBannerDismissed(true)} className="text-muted-foreground hover:text-foreground text-xs px-1" title="Dismiss">✕</button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>

      {/* ── MOBILE BOTTOM NAV (<768px) ───────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex items-stretch h-16 safe-bottom">
        {mobilePrimary.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {/* More button */}
        <button
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            mobileSecondary.some(i => location.startsWith(i.href)) ? "text-primary" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {/* ── FOOTER (desktop only) ────────────────────────────── */}
      <footer className="shrink-0 border-t border-border py-1.5 text-center text-xs text-muted-foreground/60 bg-card hidden md:block">
        Powered by MicroBooks
      </footer>
    </div>
  );
}
