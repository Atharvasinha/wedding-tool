import { getBudgetCategories, getBudgetTotals } from "@/lib/db/budget";
import { getUpcomingPayments } from "@/lib/db/payments";
import { getRecentActivity } from "@/lib/db/activity";
import { getAllPayers } from "@/lib/db/payers";
import { Money } from "@/components/Money";
import { PayerChip } from "@/components/PayerChip";
import { EmptyState } from "@/components/EmptyState";
import { BudgetBar } from "@/components/BudgetBar";
import { MarkPaidButton } from "@/components/MarkPaidButton";
import { variance, formatDate, formatDateShort, weddingCountdown, BUDGET_BASELINE } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [categories, totals, upcoming, activity, payers] = await Promise.all([
    getBudgetCategories(),
    getBudgetTotals(),
    getUpcomingPayments(5),
    getRecentActivity(10),
    getAllPayers(),
  ]);

  const v = variance(totals.planned, BUDGET_BASELINE);
  const daysToWedding = weddingCountdown();
  const payersLite = payers.map((p) => ({ id: p.id, name: p.name, display_color: p.display_color }));

  return (
    <div className="px-10 py-9 max-w-[1200px]">
      <Header daysToWedding={daysToWedding} />

      <section className="mt-8 grid grid-cols-4 gap-6 border-y border-rule py-7">
        <Kpi label="Budget" value={<Money cents={totals.planned} />} sub={`baseline ${formatCentsCompact(BUDGET_BASELINE)}`} />
        <Kpi
          label="Committed"
          value={<Money cents={totals.committed} className="text-gold" />}
          sub={pctOf(totals.committed, totals.planned)}
        />
        <Kpi
          label="Paid"
          value={<Money cents={totals.paid} className="text-teal" />}
          sub={pctOf(totals.paid, totals.planned)}
        />
        <Kpi
          label="Health"
          value={
            <span
              className={cn(
                "display italic text-[26px] leading-tight",
                v.status === "on_track" ? "text-sage" : "text-terracotta",
              )}
            >
              {v.label}
            </span>
          }
          sub={`tolerance ±5%`}
        />
      </section>

      <section className="mt-10">
        <SectionTitle title="Where the money goes" hint="click a row" />
        {categories.length === 0 ? (
          <EmptyState title="No budget yet" description="Run `npm run seed` to load the locked baseline." />
        ) : (
          <div className="mt-5 space-y-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/budget/${c.id}` as never}
                className="block rounded-md px-3 py-3 hover:bg-cream-soft transition-colors"
              >
                <BudgetBar
                  name={c.name}
                  planned={c.planned_amount}
                  baseline={c.baseline_amount}
                  color={c.default_payer?.display_color ?? c.display_color}
                  payerName={c.default_payer?.name ?? null}
                />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12 grid grid-cols-3 gap-10">
        <div className="col-span-2">
          <SectionTitle title="Upcoming payments" hint="next 5" />
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming payments" description="Add a payment from a contract or vendor page." className="mt-5" />
          ) : (
            <div className="mt-5 divide-y divide-rule rounded-md border border-rule bg-cream-soft/40">
              {upcoming.map((p) => (
                <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-4 py-3">
                  <div>
                    <div className="text-sm text-ink">{p.description}</div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      {p.contract?.vendor.name ?? "One-off"} · due {formatDate(p.due_date)}
                    </div>
                  </div>
                  <Money cents={p.amount} className="text-sm" />
                  <PayerChip
                    current={{ id: p.payer.id, name: p.payer.name, display_color: p.payer.display_color }}
                    payers={payersLite}
                    entity={{ type: "payment", id: p.id }}
                    size="sm"
                  />
                  <MarkPaidButton id={p.id} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle title="Recent activity" />
          {activity.length === 0 ? (
            <EmptyState title="Quiet so far" className="mt-5" />
          ) : (
            <ul className="mt-5 space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="text-xs text-ink-soft">
                  <div className="text-ink-muted mono">{formatDateShort(a.created_at)}</div>
                  <div className="leading-snug">{a.diff_summary ?? `${a.action} · ${a.entity_type}`}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Header({ daysToWedding }: { daysToWedding: number }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <div className="text-xs text-ink-muted mono uppercase tracking-widest">Dashboard</div>
        <h1 className="display text-[44px] leading-tight mt-1">
          Atharva <span className="italic">&amp;</span> Celesia
        </h1>
        <div className="text-sm text-ink-soft mt-1">Saturday, December 11, 2027 · Camp Lucy</div>
      </div>
      <div className="text-right">
        <div className="display text-[44px] leading-none tabular">{daysToWedding}</div>
        <div className="text-xs text-ink-muted mt-1 uppercase tracking-widest">days to go</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink-muted uppercase tracking-widest">{label}</div>
      <div className="mt-1.5 text-[28px] tabular leading-none">{value}</div>
      <div className="text-xs text-ink-muted mt-2">{sub}</div>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-rule pb-2">
      <h2 className="display text-[20px] italic">{title}</h2>
      {hint ? <div className="text-[11px] uppercase tracking-widest text-ink-muted">{hint}</div> : null}
    </div>
  );
}

function pctOf(part: bigint, total: bigint): string {
  if (total === 0n) return "—";
  const pct = (Number(part) / Number(total)) * 100;
  return `${pct.toFixed(0)}% of budget`;
}

function formatCentsCompact(cents: bigint): string {
  const n = Number(cents) / 100;
  return `$${Math.round(n).toLocaleString()}`;
}
