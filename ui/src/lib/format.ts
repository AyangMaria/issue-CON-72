import type { Money } from "@/schemas";


export function formatMoney(m: Money) {
  const display = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: m.currency,
    maximumFractionDigits: 0,
  }).format(m.amount_minor / 100);
  const basisLabel = m.basis === "verified_operational" ? "verified" : m.basis.replaceAll("_", " ");
  return { display, basisLabel };
}

export function titleCase(s: string) {
  return s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}