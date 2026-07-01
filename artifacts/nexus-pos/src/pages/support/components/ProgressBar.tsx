interface ProgressBarProps {
  current: number;
  total: number;
}

/** Amber step-progress bar for the guided ticket flow. */
export function ProgressBar({ current, total }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (current / total) * 100));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-amber-400">
          Step {current} of {total}
        </span>
        <span className="text-xs text-slate-400">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-700/70 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
