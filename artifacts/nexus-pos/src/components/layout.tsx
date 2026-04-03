import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ShoppingCart, ListOrdered, Store, Package } from "lucide-react";
import { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "Point of Sale", icon: ShoppingCart },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/products", label: "Products", icon: Package },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Store className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Nexus POS</span>
        </div>
        
        <nav className="flex items-center gap-6">
          {NAV_ITEMS.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-secondary border border-border" />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        {children}
      </main>

      <footer className="shrink-0 border-t border-border py-2 text-center text-xs text-muted-foreground bg-card">
        Powered by MicroBooks
      </footer>
    </div>
  );
}
