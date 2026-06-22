import Link from "next/link";
import { getBudgetCategories, getBudgetTotals } from "@/lib/db/budget";
import { getAllPayers } from "@/lib/db/payers";
import { Money } from "@/components/Money";
import { PayerChip } from "@/components/PayerChip";
import { variance, BUDGET_BASELINE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BudgetRow } from "./BudgetRow";

export const dynamic = "force-dynamic";

export default async function BudgetPage() {
  const [categories, totals, payers] = await Promise.all([
    getBudgetCategories(),
    getBudgetTotals(),
    getAllPayers(),
  ]);
  const payersLite = payers.map((p) => ({ id: p.id, name: p.name, display_color: p.display_color }));
  const v = variance(totals.planned, BUDGET_BASELINE);

  return (
    <div className="px-10 py-9 max-w-[1100px]">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-muted mono uppercase tracking-widest">Budget editor</div>
          <h1 className="display text-[36px] leading-tight mt-1">Working numbers</h1>
          <div className="text-sm text-ink-soft mt-1">
            Edits commit on blur. Click any payer to change it.
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-widest text-ink-muted">Variance vs. baseline</div>
          <div className={cn("display italic text-[28px] tabular", v.status === "on_track" ? "text-sage" : "text-terracotta")}>
            {v.label}
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-rule bg-cream-soft/40 overflow-hidden">
        <table className="w-full">
          <thead className="bg-cream-deep/60 text-[11px] uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Category</th>
              <th className="text-right px-4 py-3 font-medium">Baseline</th>
              <th className="text-right px-4 py-3 font-medium">Planned</th>
              <th className="text-left px-4 py-3 font-medium">Default payer</th>
              <th className="text-left px-4 py-3 font-medium">Notes</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {categories.map((c) => (
              <BudgetRow
                key={c.id}
                id={c.id}
                name={c.name}
                baseline={c.baseline_amount}
                planned={c.planned_amount}
                notes={c.notes}
                payer={c.default_payer ? { id: c.default_payer.id, name: c.default_payer.name, display_color: c.default_payer.display_color } : null}
                payers={payersLite}
              />
            ))}
          </tbody>
          <tfoot className="bg-cream-deep/40 text-sm">
            <tr>
              <td className="px-4 py-3 font-medium">Working total</td>
              <td className="px-4 py-3 text-right"><Money cents={totals.baseline} /></td>
              <td className="px-4 py-3 text-right"><Money cents={totals.planned} /></td>
              <td className="px-4 py-3 text-ink-muted text-xs">baseline locked at $142,682</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 text-xs text-ink-muted">
        <Link href="/dashboard" className="hover:text-ink underline-offset-4 hover:underline">← back to dashboard</Link>
      </div>
    </div>
  );
}
