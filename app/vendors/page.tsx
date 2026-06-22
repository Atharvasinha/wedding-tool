import Link from "next/link";
import { getActiveVendors, KANBAN_COLUMNS } from "@/lib/db/vendors";
import { EmptyState } from "@/components/EmptyState";
import { Money } from "@/components/Money";
import { AddVendorDialog } from "./AddVendorDialog";
import { daysUntil } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendors = await getActiveVendors();

  const byColumn = new Map(KANBAN_COLUMNS.map((c) => [c.id, [] as typeof vendors]));
  for (const v of vendors) {
    for (const col of KANBAN_COLUMNS) {
      if ((col.statuses as readonly string[]).includes(v.status)) {
        byColumn.get(col.id)!.push(v);
        break;
      }
    }
  }

  return (
    <div className="px-10 py-9">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-muted mono uppercase tracking-widest">Vendors &amp; contracts</div>
          <h1 className="display text-[36px] leading-tight mt-1">Pipeline</h1>
        </div>
        <AddVendorDialog />
      </div>

      {vendors.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          description='Click "Add vendor" to get started.'
          className="mt-10"
        />
      ) : (
        <>
        <CompareLinks vendors={vendors} />
        <div className="mt-8 grid grid-cols-5 gap-4">
          {KANBAN_COLUMNS.map((col) => {
            const items = byColumn.get(col.id) ?? [];
            return (
              <div key={col.id} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between border-b border-rule pb-2">
                  <h3 className="display text-sm italic">{col.label}</h3>
                  <span className="text-[11px] mono tabular text-ink-muted">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.length === 0 ? (
                    <div className="text-[11px] text-ink-muted/70 italic px-1">—</div>
                  ) : (
                    items.map((v) => <VendorCard key={v.id} v={v} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

// Categories where you've gathered 2+ vendors → comparison links
function CompareLinks({ vendors }: { vendors: Awaited<ReturnType<typeof getActiveVendors>> }) {
  const byCategory = new Map<string, number>();
  for (const v of vendors) {
    byCategory.set(v.category, (byCategory.get(v.category) ?? 0) + 1);
  }
  const comparable = [...byCategory.entries()].filter(([, n]) => n >= 2);
  if (comparable.length === 0) return null;
  return (
    <div className="mt-5 flex items-center gap-3 text-xs">
      <span className="text-ink-muted uppercase tracking-widest text-[10px]">Compare</span>
      {comparable.map(([cat, n]) => (
        <Link
          key={cat}
          href={`/vendors/compare/${cat}` as never}
          className="inline-flex items-center gap-1 rounded-full border border-rule bg-cream-soft px-2.5 py-1 text-ink-soft hover:bg-cream-deep"
        >
          {cat.replace(/_/g, " ")}
          <span className="mono tabular text-ink-muted">({n})</span>
        </Link>
      ))}
    </div>
  );
}

function VendorCard({ v }: { v: Awaited<ReturnType<typeof getActiveVendors>>[number] }) {
  const topAmount =
    v.contracts[0]?.total_contract_amount ??
    (v.estimates.length ? v.estimates.reduce((max, e) => (e.total_amount > max ? e.total_amount : max), v.estimates[0].total_amount) : null);
  const isContracted = v.contracts.length > 0;
  const staleDays = -daysUntil(v.updated_at);
  const nextPayment = v.contracts
    .flatMap((c) => c.payments)
    .filter((p) => !p.paid_date)
    .sort((a, b) => +a.due_date - +b.due_date)[0];

  return (
    <Link
      href={`/vendors/${v.id}` as never}
      className="block rounded-md border border-rule bg-cream-soft p-3 hover:bg-cream-deep transition-colors"
    >
      <div className="text-[10px] uppercase tracking-widest text-ink-muted">{v.category.replace(/_/g, " ")}</div>
      <div className="display text-sm mt-1 leading-tight">{v.name}</div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        {topAmount != null ? <Money cents={topAmount} className="text-xs" /> : <span className="text-ink-muted">—</span>}
        {!isContracted && staleDays > 7 ? (
          <span className="text-[10px] text-terracotta">{staleDays}d stale</span>
        ) : null}
      </div>
      {nextPayment ? (
        <div className="mt-2 text-[11px] text-teal">
          Next: <span className="tabular mono">${(Number(nextPayment.amount) / 100).toLocaleString()}</span> · {nextPayment.due_date.toISOString().slice(5, 10)}
        </div>
      ) : null}
    </Link>
  );
}
