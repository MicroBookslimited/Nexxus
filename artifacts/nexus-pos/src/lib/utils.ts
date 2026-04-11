import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtUSD(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-JM", { dateStyle: "medium" }).format(new Date(iso));
}

export function fmtMonth(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return new Intl.DateTimeFormat("en-JM", { year: "numeric", month: "long" }).format(new Date(Number(y), Number(m) - 1));
}
