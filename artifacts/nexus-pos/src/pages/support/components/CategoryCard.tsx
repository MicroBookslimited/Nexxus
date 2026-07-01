import { Monitor, Package, Users, BarChart2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  monitor: Monitor,
  package: Package,
  users: Users,
  chart: BarChart2,
};

interface CategoryCardProps {
  icon: "monitor" | "package" | "users" | "chart";
  label: string;
  accent: string;
  selected?: boolean;
  onClick: () => void;
}

/** Large tap card used for category selection (Step 1). Min height 80px. */
export function CategoryCard({ icon, label, accent, selected, onClick }: CategoryCardProps) {
  const Icon = ICONS[icon] ?? Monitor;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start justify-center gap-3 rounded-2xl border p-5 text-left transition-all min-h-[110px] active:scale-[0.98]",
        selected
          ? "border-amber-400 bg-amber-400/10 ring-1 ring-amber-400"
          : "border-slate-700 bg-slate-800/60 hover:border-slate-500 hover:bg-slate-800",
      )}
    >
      <Icon className={cn("h-8 w-8", accent)} />
      <span className="text-base font-semibold text-slate-100 leading-tight">{label}</span>
    </button>
  );
}
