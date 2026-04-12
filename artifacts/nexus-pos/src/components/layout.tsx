import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, ShoppingCart, ListOrdered, Package, Users, BarChart2,
  Maximize, Minimize, UtensilsCrossed, ChefHat, UserCog, Coins, Settings,
  CreditCard, LogOut, ChevronDown, AlertTriangle, Clock, MapPin, Calculator,
  Menu, X, MoreHorizontal, BookOpen, Sun, Moon, ShieldOff, UserCheck, Monitor,
  FlaskConical, Factory, Store,
} from "lucide-react";
import { ReactNode, useState, useCallback, useEffect, useRef } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import logoUrl from "@assets/EB8B578F-2602-4DD8-AB97-D02AF59C49D3_1775943434994.png";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TENANT_TOKEN_KEY, saasMe } from "@/lib/saas-api";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { useTheme } from "@/contexts/ThemeContext";
import { useStaff } from "@/contexts/StaffContext";
import { PinPad } from "@/components/PinPad";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  color: string;
  permission: string | null;
  children?: never;
};

type NavGroup = {
  href?: never;
  label: string;
  icon: React.ElementType;
  color: string;
  permission: string | null;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

const NAV_ITEMS: NavEntry[] = [
  { href: "/dashboard",    label: "Dashboard",   icon: LayoutDashboard, color: "text-sky-400",     permission: null },
  { href: "/pos",          label: "POS",          icon: ShoppingCart,    color: "text-emerald-400", permission: "pos.sale" },
  { href: "/tables",       label: "Tables",       icon: UtensilsCrossed, color: "text-orange-400",  permission: "orders.view" },
  { href: "/kitchen",      label: "Kitchen",      icon: ChefHat,         color: "text-red-400",     permission: "kitchen.view" },
  { href: "/orders",       label: "Orders",       icon: ListOrdered,     color: "text-purple-400",  permission: "orders.view" },
  { href: "/cash",         label: "Cash",         icon: Coins,           color: "text-yellow-400",  permission: "cash.open_session" },
  { href: "/products",     label: "Products",     icon: Package,         color: "text-teal-400",    permission: "inventory.view" },
  { href: "/customers",    label: "Customers",    icon: Users,           color: "text-pink-400",    permission: "customers.view" },
  { href: "/staff",        label: "Staff",        icon: UserCog,         color: "text-indigo-400",  permission: "staff.view" },
  { href: "/locations",    label: "Locations",    icon: MapPin,          color: "text-rose-400",    permission: "inventory.manage" },
  {
    label: "Production",
    icon: FlaskConical,
    color: "text-lime-400",
    permission: "inventory.manage",
    children: [
      { href: "/ingredients", label: "Ingredients", icon: FlaskConical, color: "text-lime-400",   permission: "inventory.manage" },
      { href: "/recipes",     label: "Recipes",     icon: BookOpen,     color: "text-green-400",  permission: "inventory.manage" },
      { href: "/production",  label: "Production",  icon: Factory,      color: "text-lime-400",   permission: "inventory.manage" },
    ],
  },
  { href: "/accounting",   label: "Accounting",   icon: Calculator,      color: "text-cyan-400",    permission: "reports.view" },
  { href: "/ar",           label: "Receivables",  icon: BookOpen,        color: "text-violet-400",  permission: "reports.view" },
  { href: "/reports",      label: "Reports",      icon: BarChart2,       color: "text-amber-400",   permission: "reports.view" },
  { href: "/store",        label: "Store",        icon: Store,           color: "text-fuchsia-400", permission: null },
  { href: "/subscription", label: "Plan",         icon: CreditCard,      color: "text-green-400",   permission: "settings.manage" },
];

const MOBILE_PRIMARY = ["/dashboard", "/pos", "/orders", "/customers"];

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

function isGroup(entry: NavEntry): entry is NavGroup {
  return Array.isArray((entry as NavGroup).children);
}

type NavGroupButtonProps = {
  entry: NavGroup;
  iconOnly?: boolean;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  can: (perm: string) => boolean;
  location: string;
};

function NavGroupButton({ entry, iconOnly, active, open, onOpenChange, can, location }: NavGroupButtonProps) {
  const children = entry.children.filter(c => !c.permission || can(c.permission));

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>
        {iconOnly ? (
          <button
            title={entry.label}
            className={cn(
              "flex items-center justify-center w-10 h-9 rounded-md transition-all shrink-0 outline-none",
              active ? "bg-white/10" : "hover:bg-secondary/60",
            )}
          >
            <entry.icon className={cn("h-5 w-5 drop-shadow-sm", entry.color)} />
          </button>
        ) : (
          <button
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap shrink-0 outline-none",
              active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
            )}
          >
            <entry.icon className={cn("h-5 w-5 shrink-0 drop-shadow-sm", entry.color)} />
            {entry.label}
            <ChevronDown className={cn("h-3.5 w-3.5 ml-0.5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={4}
          align="start"
          className="z-[9999] min-w-[152px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
        >
          {children.map(child => {
            const childActive = location.startsWith(child.href);
            return (
              <DropdownMenu.Item
                key={child.href}
                asChild
                onSelect={() => onOpenChange(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium transition-colors cursor-pointer outline-none select-none",
                  childActive
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus:text-foreground focus:bg-secondary/60",
                )}
              >
                <Link href={child.href}>
                  <child.icon className={cn("h-4 w-4 shrink-0", child.color)} />
                  {child.label}
                </Link>
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Check if any child of a group matches the current location */
function groupActive(group: NavGroup, location: string) {
  return group.children.some(c => location.startsWith(c.href));
}

export function Layout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { staff, setStaff, can, clearStaff } = useStaff();
  const [switchUserOpen, setSwitchUserOpen] = useState(false);

  // Tracks which group labels are expanded (desktop dropdown & mobile accordion)
  // Always start closed — the header nav dropdown uses Radix controlled state,
  // and starting "open" on page load causes the menu to auto-pop, hiding the icon.
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const closeAllGroups = () => setOpenGroups(new Set());

  // Close open groups whenever the route changes
  useEffect(() => {
    setOpenGroups(new Set());
  }, [location]);

  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const timeLeft = useCountdown(expiryDate);
  const [tenantEmail, setTenantEmail] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) return;
    saasMe().then((me) => {
      const sub = me.subscription;
      setTenantEmail(me.tenant.email);
      setEmailVerified(me.tenant.emailVerified ?? true);
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
    clearStaff();
    setProfileOpen(false);
    navigate("/login");
  }, [navigate, clearStaff]);

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

  // Filter entries: for groups, filter children too
  const canSeeEntry = (entry: NavEntry): boolean => {
    if (!entry.permission || can(entry.permission)) {
      if (isGroup(entry)) return entry.children.some(c => !c.permission || can(c.permission));
      return true;
    }
    return false;
  };

  const visibleNav = NAV_ITEMS.filter(canSeeEntry);
  const flatItems = visibleNav.flatMap(e => isGroup(e) ? e.children : [e]);
  const mobilePrimary = flatItems.filter(i => MOBILE_PRIMARY.includes(i.href));
  const mobileSecondary = flatItems.filter(i => !MOBILE_PRIMARY.includes(i.href));

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">

      {/* ── TOP HEADER ───────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3 sm:px-5 bg-card">

        {/* Logo */}
        <div className="flex items-center shrink-0">
          <img src={logoUrl} alt="NEXXUS POS" className="h-8 w-auto" />
        </div>

        {/* ── DESKTOP NAV (≥1280px): dynamic — active shows label, inactive icon-only ── */}
        <nav className="hidden xl:flex items-center gap-0 overflow-x-auto no-scrollbar mx-2 flex-1">
          {visibleNav.map((entry) => {
            if (isGroup(entry)) {
              const active = groupActive(entry, location);
              const open = openGroups.has(entry.label);
              return (
                <NavGroupButton
                  key={entry.label}
                  entry={entry}
                  active={active}
                  iconOnly={!active}
                  open={open}
                  onOpenChange={(o) => o ? setOpenGroups(new Set([entry.label])) : setOpenGroups(new Set())}
                  can={can}
                  location={location}
                />
              );
            }
            const isActive = location.startsWith(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                title={entry.label}
                className={cn(
                  "flex items-center gap-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-white/10 text-foreground px-2 py-1.5"
                    : "hover:bg-secondary/60 px-2 py-1.5 w-10 justify-center",
                )}
              >
                <entry.icon className={cn("h-5 w-5 shrink-0 drop-shadow-sm", entry.color)} />
                {isActive && entry.label}
              </Link>
            );
          })}
        </nav>

        {/* ── TABLET NAV (768-1279px): icon-only with tooltip ── */}
        <nav className="hidden md:flex xl:hidden items-center gap-0 overflow-x-auto no-scrollbar mx-2 flex-1 justify-center">
          {visibleNav.map((entry) => {
            if (isGroup(entry)) {
              const active = groupActive(entry, location);
              const open = openGroups.has(entry.label);
              return (
                <NavGroupButton
                  key={entry.label}
                  entry={entry}
                  iconOnly
                  active={active}
                  open={open}
                  onOpenChange={(o) => o ? setOpenGroups(new Set([entry.label])) : setOpenGroups(new Set())}
                  can={can}
                  location={location}
                />
              );
            }
            const isActive = location.startsWith(entry.href);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                title={entry.label}
                className={cn(
                  "flex items-center justify-center w-10 h-9 rounded-md transition-all shrink-0",
                  isActive ? "bg-white/10" : "hover:bg-secondary/60",
                )}
              >
                <entry.icon className={cn("h-5 w-5 drop-shadow-sm", entry.color)} />
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
          {/* Staff badge */}
          {staff && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-medium text-primary truncate max-w-20">{staff.name}</span>
              <span className="text-[9px] text-muted-foreground hidden lg:inline">({staff.role})</span>
            </div>
          )}
          {/* Settings */}
          {can("settings.view") && (
            <Link
              href="/settings"
              title="Settings"
              className={cn(
                "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                location.startsWith("/settings")
                  ? "bg-orange-400/15 text-orange-400"
                  : "text-orange-400 hover:bg-orange-400/10",
              )}
            >
              <Settings className="h-4 w-4 drop-shadow-sm" />
            </Link>
          )}

          {/* Switch User */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-violet-400 hover:text-violet-300 hover:bg-violet-400/10 transition-colors"
            onClick={() => setSwitchUserOpen(true)}
            title="Switch staff user"
          >
            <UserCheck className="h-4 w-4 drop-shadow-sm" />
          </Button>

          {/* Theme toggle */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 hidden sm:flex hover:bg-secondary/60 transition-colors"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4 text-yellow-400 drop-shadow-sm" />
              : <Moon className="h-4 w-4 text-blue-400 drop-shadow-sm" />}
          </Button>

          {/* Open Customer Display */}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 hidden sm:flex transition-colors"
            onClick={() => window.open("/customer-display/", "nexus-customer-display", "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no")}
            title="Open Customer Display (second screen)"
          >
            <Monitor className="h-4 w-4 drop-shadow-sm" />
          </Button>

          {fsSupported && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 hidden sm:flex transition-colors"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen
                ? <Minimize className="h-4 w-4 drop-shadow-sm" />
                : <Maximize className="h-4 w-4 drop-shadow-sm" />}
            </Button>
          )}

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1.5 hover:bg-secondary/60 transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-500 border border-fuchsia-400/40 flex items-center justify-center shadow-sm">
                <span className="text-[10px] font-bold text-white">A</span>
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
              <div className="flex items-center">
                <img src={logoUrl} alt="NEXXUS POS" className="h-7 w-auto" />
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
              {visibleNav.map((entry) => {
                if (isGroup(entry)) {
                  const active = groupActive(entry, location);
                  const open = openGroups.has(entry.label);
                  return (
                    <div key={entry.label}>
                      <button
                        onClick={() => toggleGroup(entry.label)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5",
                          active
                            ? "bg-white/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                        )}
                      >
                        <entry.icon className={cn("h-4 w-4 shrink-0", entry.color)} />
                        <span className="flex-1 text-left">{entry.label}</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                      </button>
                      {open && (
                        <div className="ml-4 mb-1 pl-3 border-l border-border space-y-0.5">
                          {entry.children.filter(c => !c.permission || can(c.permission)).map(child => {
                            const childActive = location.startsWith(child.href);
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                  childActive
                                    ? "bg-white/10 text-foreground"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                                )}
                              >
                                <child.icon className={cn("h-4 w-4 shrink-0", child.color)} />
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }
                // Flat item
                const isActive = location.startsWith(entry.href);
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-0.5",
                      isActive
                        ? "bg-white/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    )}
                  >
                    <entry.icon className={cn("h-4 w-4 shrink-0", entry.color)} />
                    {entry.label}
                  </Link>
                );
              })}
            </nav>

            {/* Drawer footer */}
            <div className="shrink-0 border-t border-border p-3 space-y-1">
              {staff && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 mb-2">
                  <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-primary truncate">{staff.name}</p>
                    <p className="text-[10px] text-muted-foreground">{staff.role}</p>
                  </div>
                </div>
              )}
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              </button>
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

      {/* ── EMAIL VERIFICATION POPUP ─────────────────────────── */}
      {emailVerified === false && tenantEmail && (
        <EmailVerificationBanner email={tenantEmail} />
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
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", item.color)} />
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

      {/* ── SWITCH USER DIALOG ───────────────────────────────── */}
      <Dialog open={switchUserOpen} onOpenChange={setSwitchUserOpen}>
        <DialogContent className="max-w-xs bg-card border-border p-6">
          <DialogHeader className="items-center text-center pb-2">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
              <UserCheck className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold">Switch Staff User</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {staff ? `Currently: ${staff.name} (${staff.role})` : "No staff signed in"}
            </p>
          </DialogHeader>
          <PinPad
            title=""
            subtitle="Enter your 4-digit PIN to identify yourself"
            onSuccess={(s: { id: number; name: string; role: string; permissions?: string[] }) => {
              setStaff({ id: s.id, name: s.name, role: s.role, permissions: s.permissions ?? [] });
              setSwitchUserOpen(false);
            }}
            pinLength={4}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  const { can, staff } = useStaff();
  if (!staff || can(permission)) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 py-16">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldOff className="h-8 w-8 text-destructive" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your role ({staff.role}) does not have permission to access this area.
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">Contact your manager for assistance.</p>
      </div>
    </div>
  );
}
