import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import type { vendor_category } from "@prisma/client";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VENDOR_CATEGORIES: vendor_category[] = [
  "venue", "catering", "photography", "videography", "dj_band", "florist",
  "rentals", "hair_makeup", "attire", "transportation", "stationery",
  "officiant", "priest", "planner", "accommodation", "other",
];

export default async function VendorCompare({ params }: { params: { category: string } }) {
  if (!VENDOR_CATEGORIES.includes(params.category as vendor_category)) notFound();
  const category = params.category as vendor_category;

  const vendors = await prisma.vendors.findMany({
    where: { category, archived_at: null },
    orderBy: { name: "asc" },
    include: {
      estimates: { orderBy: { received_date: "desc" } },
      contracts: { include: { payments: true } },
    },
  });

  if (vendors.length === 0) {
    return (
      <div className="px-10 py-9 max-w-[1200px]">
        <Link href="/vendors" className="text-xs text-ink-muted hover:text-ink">← back to vendors</Link>
        <h1 className="display text-[36px] leading-tight mt-2">Compare · {category.replace(/_/g, " ")}</h1>
        <EmptyState title="No vendors in this category yet" className="mt-10" />
      </div>
    );
  }

  // Find the lowest non-zero estimate amount across all vendors for highlighting
  const allAmounts = vendors
    .flatMap((v) => v.estimates.map((e) => e.total_amount))
    .filter((a) => a > 0n);
  const lowestAmount = allAmounts.length > 0 ? allAmounts.reduce((a, b) => (a < b ? a : b)) : null;

  return (
    <div className="px-10 py-9 max-w-[1400px]">
      <Link href="/vendors" className="text-xs text-ink-muted hover:text-ink">← back to vendors</Link>
      <div className="flex items-end justify-between mt-2">
        <div>
          <div className="text-xs text-ink-muted mono uppercase tracking-widest">Compare</div>
          <h1 className="display text-[36px] leading-tight mt-1">{category.replace(/_/g, " ")}</h1>
          <div className="text-sm text-ink-soft mt-1">
            Side-by-side comparison · {vendors.length} vendor{vendors.length === 1 ? "" : "s"}
            {lowestAmount ? <> · lowest <Money cents={lowestAmount} className="text-sm" /></> : null}
          </div>
        </div>
      </div>

      <div className={cn(
        "mt-8 grid gap-4",
        vendors.length === 1 ? "grid-cols-1" :
        vendors.length === 2 ? "grid-cols-2" :
        vendors.length === 3 ? "grid-cols-3" :
        "grid-cols-4",
      )}>
        {vendors.map((v) => {
          const topEstimate = v.estimates[0];
          const contract = v.contracts[0];
          const isCheapest = topEstimate && lowestAmount && topEstimate.total_amount === lowestAmount;
          const isContracted = !!contract;
          const stale = !isContracted && -daysUntil(v.updated_at) > 14;

          return (
            <div
              key={v.id}
              className={cn(
                "rounded-lg border p-5 bg-cream-soft flex flex-col gap-4",
                isContracted ? "border-teal/40 bg-teal/5" :
                isCheapest ? "border-gold/40" : "border-rule",
              )}
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/vendors/${v.id}`} className="display text-lg leading-tight hover:underline">
                    {v.name}
                  </Link>
                  <StatusBadge value={v.status} />
                </div>
                {v.contact_name ? (
                  <div className="text-xs text-ink-muted mt-1">{v.contact_name}</div>
                ) : null}
                {v.contact_email ? (
                  <a href={`mailto:${v.contact_email}`} className="text-xs text-teal hover:underline mono break-all">
                    {v.contact_email}
                  </a>
                ) : null}
              </div>

              {/* Top estimate / contract */}
              <div className="border-y border-rule py-4 -mx-5 px-5">
                <div className="text-[10px] uppercase tracking-widest text-ink-muted">
                  {isContracted ? "Contract" : topEstimate ? "Latest estimate" : "No estimate yet"}
                </div>
                {isContracted ? (
                  <>
                    <div className="display text-[28px] tabular leading-none mt-1">
                      <Money cents={contract.total_contract_amount} className="text-[28px]" />
                    </div>
                    <div className="text-xs text-ink-muted mt-1">signed {formatDate(contract.signed_date)}</div>
                  </>
                ) : topEstimate ? (
                  <>
                    <div className={cn("display text-[28px] tabular leading-none mt-1", isCheapest && "text-gold")}>
                      <Money cents={topEstimate.total_amount} className="text-[28px]" />
                    </div>
                    <div className="text-xs text-ink-muted mt-1">
                      received {formatDate(topEstimate.received_date)}
                      {isCheapest ? <span className="text-gold ml-2">· lowest</span> : null}
                    </div>
                    {topEstimate.package_name ? (
                      <div className="text-xs text-ink-soft mt-2">{topEstimate.package_name}</div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-ink-muted italic mt-1">—</div>
                )}
              </div>

              {/* All estimates if multiple */}
              {v.estimates.length > 1 ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-muted mb-2">
                    All estimates ({v.estimates.length})
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {v.estimates.map((e) => (
                      <div key={e.id} className="flex justify-between gap-2">
                        <span className="text-ink-soft truncate">{e.package_name ?? "—"}</span>
                        <Money cents={e.total_amount} className="text-xs shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Notes / stale */}
              <div className="mt-auto pt-2 text-[11px] text-ink-muted">
                {stale ? <span className="text-terracotta">{-daysUntil(v.updated_at)}d stale</span> : null}
                {v.notes ? <p className="mt-1 text-ink-soft line-clamp-3">{v.notes}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
