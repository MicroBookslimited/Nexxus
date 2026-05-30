export function formatMoney(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  const negative = v < 0;
  const fixed = Math.abs(v).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}J$${withCommas}.${decPart}`;
}

export function formatNumber(n: number | null | undefined): string {
  const v = typeof n === "number" && isFinite(n) ? n : 0;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function todayISO(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (x: number) => String(x).padStart(2, "0");
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
