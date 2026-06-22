import Link from "next/link";
import { notFound } from "next/navigation";
import { getBudgetCategory } from "@/lib/db/budget";
import { getPaymentsForCategory } from "@/lib/db/payments";
import { getAllPayers } from "@/lib/db/payers";
import { Money } from "@/components/Money";
import { PayerChip } from "@/components/PayerChip";
import { MarkPaidButton } from "@/components/MarkPaidButton";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, variance } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CategoryDrilldown({ params }: { params: { id: string } }) {
  const [category, payers] = await Promise.all([
    getBudgetCategory(params.id),
    getAllPayers(),
  ]);
  if (!category) notFound();

  const payments = await getPaymentsForCategory(category.name);
  const payersLite = payers.map((p) => ({ id: p.id, name: p.name, display_color: p.display_color }));

  const committed = payments
    .filter((p) => p.contract && p.contract.status !== "draft" && p.contract.status !== "cancelled")
    .reduce((s, p) => s + p.amount, 0n);
  const paid = payments.filter((p) => p.paid_date).reduce((s, p) => s + p.amount, 0n);
  const v = variance(category.planned_amount, category.baseline_amount);

  return (
    <div className="px-10 py-9 max-w-[1000px]">
      <Link href="/budget" className="text-xs text-ink-muted hover:text-ink">← back to budget</Link>

      <h1 className="display text-[36px] mt-2">{category.name}</h1>

      <div className="mt-5 grid grid-cols-4 gap-6 border-y border-rule py-6">
        <Stat label="Baseline" value={<Money cents={category.baseline_amount} />} />
        <Stat label="Planned" value={<Money cents={category.planned_amount} />} sub={<span className={cn(v.status === "on_track" ? "text-sage" : "text-terracotta")}>{v.label}</span>} />
        <Stat label="Committed" value={<Money cents={committed} className="text-gold" />} />
        <Stat label="Paid" value={<Money cents={paid} className="text-teal" />} />
      </div>

      <section className="mt-10">
        <h2 className="display text-[20px] italic border-b border-rule pb-2">Payments</h2>
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" description="Payments appear here once a contract under this category exists." className="mt-5" />
        ) : (
          <table className="w-full mt-5">
            <thead className="text-[11px] uppercase tracking-widest text-ink-muted">
              <tr>
                <th className="text-left py-2">Description</th>
                <th className="text-left py-2">Vendor</th>
                <th className="text-left py-2">Due</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-left py-2 pl-4">Payer</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {payments.map((p) => (
                <tr key={p.id} className="hover:bg-cream-soft/50">
                  <td className="py-2.5 text-sm">{p.description}</td>
                  <td className="py-2.5 text-sm text-ink-soft">{p.contract?.vendor.name ?? "—"}</td>
                  <td className="py-2.5 text-xs text-ink-muted">{formatDate(p.due_date)}</td>
                  <td className="py-2.5 text-right"><Money cents={p.amount} /></td>
                  <td className="py-2.5 pl-4">
                    <PayerChip
                      current={{ id: p.payer.id, name: p.payer.name, display_color: p.payer.display_color }}
                      payers={payersLite}
                      entity={{ type: "payment", id: p.id }}
                      size="sm"
                    />
                  </td>
                  <td className="py-2.5 text-right">
                    {p.paid_date ? (
                      <span className="text-[11px] text-teal">paid {formatDate(p.paid_date)}</span>
                    ) : (
                      <MarkPaidButton id={p.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-ink-muted">{label}</div>
      <div className="display text-[24px] mt-1 tabular">{value}</div>
      {sub ? <div className="text-xs mt-1">{sub}</div> : null}
    </div>
  );
}
