const TOLERANCE = parseFloat(process.env.BUDGET_TOLERANCE ?? "0.05");
const BASELINE_CENTS = BigInt(process.env.BUDGET_BASELINE_CENTS ?? "14268200");
const WEDDING_DATE_ISO = process.env.WEDDING_DATE ?? "2027-12-11";

const dollarFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const dollarFmtWithCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function centsToDollars(cents: bigint | number): number {
  return Number(cents) / 100;
}

export function formatCents(cents: bigint | number | null | undefined): string {
  if (cents == null) return "—";
  const value = typeof cents === "bigint" ? cents : BigInt(Math.round(cents));
  const hasFractional = value % 100n !== 0n;
  return hasFractional
    ? dollarFmtWithCents.format(centsToDollars(value))
    : dollarFmt.format(centsToDollars(value));
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const dateShortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateShortFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function daysUntil(d: Date | string): number {
  const target = typeof d === "string" ? new Date(d) : d;
  const ms = target.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export const WEDDING_DATE = new Date(WEDDING_DATE_ISO + "T00:00:00Z");

export function weddingCountdown(): number {
  return daysUntil(WEDDING_DATE);
}

export type Variance = {
  delta: bigint;
  pct: number;
  status: "on_track" | "over" | "under";
  label: string;
};

export function variance(planned: bigint, baseline: bigint = BASELINE_CENTS): Variance {
  const delta = planned - baseline;
  const pct = baseline === 0n ? 0 : Number(delta) / Number(baseline);
  const inBand = Math.abs(pct) <= TOLERANCE;
  const status: Variance["status"] = inBand ? "on_track" : delta > 0n ? "over" : "under";
  const sign = pct > 0 ? "+" : "";
  const label = inBand ? "On track" : `${sign}${(pct * 100).toFixed(1)}%`;
  return { delta, pct, status, label };
}

export const BUDGET_BASELINE = BASELINE_CENTS;
export const BUDGET_TOLERANCE = TOLERANCE;
