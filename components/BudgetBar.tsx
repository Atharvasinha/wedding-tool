import { formatCents } from "@/lib/format";

type Props = {
  name: string;
  planned: bigint;
  baseline: bigint;
  color: string;
  payerName: string | null;
};

export function BudgetBar({ name, planned, baseline, color, payerName }: Props) {
  const max = planned > baseline ? planned : baseline;
  const plannedPct = max === 0n ? 0 : Math.min(100, (Number(planned) / Number(max)) * 100);
  const baselinePct = max === 0n ? 0 : (Number(baseline) / Number(max)) * 100;

  return (
    <div className="grid grid-cols-[220px_1fr_auto] items-center gap-5">
      <div>
        <div className="text-sm text-ink">{name}</div>
        {payerName ? (
          <div className="text-[11px] text-ink-muted mt-0.5">{payerName}</div>
        ) : null}
      </div>
      <div className="relative h-6 rounded-sm bg-cream-deep overflow-hidden">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${plannedPct}%`, backgroundColor: color, opacity: 0.85 }}
        />
        <div
          className="absolute inset-y-0 w-px bg-ink/40"
          style={{ left: `${baselinePct}%` }}
          title={`baseline ${formatCents(baseline)}`}
        />
      </div>
      <div className="text-right tabular mono text-sm w-28">{formatCents(planned)}</div>
    </div>
  );
}
