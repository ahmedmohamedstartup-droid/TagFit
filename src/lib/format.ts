export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ar-EG").format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("ar-EG", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ar-EG", { month: "short", day: "numeric" }).format(new Date(iso));
}
