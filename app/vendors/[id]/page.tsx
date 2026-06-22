import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorById, getActiveVendors } from "@/lib/db/vendors";
import { getAllPayers } from "@/lib/db/payers";
import { getEmailsForVendor, getVendorReplyStatus } from "@/lib/db/email";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { PayerChip } from "@/components/PayerChip";
import { EmptyState } from "@/components/EmptyState";
import { MarkPaidButton } from "@/components/MarkPaidButton";
import { VendorStatusChanger } from "./VendorStatusChanger";
import { AddEstimateForm } from "./AddEstimateForm";
import { VendorMergeDialog } from "./VendorMergeDialog";
import { VendorEmailsSection } from "./VendorEmailsSection";
import { formatDate, daysUntil } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function VendorDetail({ params }: { params: { id: string } }) {
  const [vendor, payers, emails, replyStatus, otherVendors] = await Promise.all([
    getVendorById(params.id),
    getAllPayers(),
    getEmailsForVendor(params.id),
    getVendorReplyStatus(params.id),
    getActiveVendors(),
  ]);
  if (!vendor) notFound();

  const payersLite = payers.map((p) => ({ id: p.id, name: p.name, display_color: p.display_color }));
  const mergeTargets = otherVendors
    .filter((v) => v.id !== params.id)
    .map((v) => ({ id: v.id, name: v.name, category: v.category }));

  return (
    <div className="px-10 py-9 max-w-[1000px]">
      <Link href="/vendors" className="text-xs text-ink-muted hover:text-ink">← back to vendors</Link>

      <div className="mt-2 flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-ink-muted">{vendor.category.replace(/_/g, " ")}</div>
          <h1 className="display text-[36px] leading-tight mt-1">{vendor.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-ink-soft">
            {vendor.contact_name ? <span>{vendor.contact_name}</span> : null}
            {vendor.contact_email ? <a href={`mailto:${vendor.contact_email}`} className="hover:text-ink underline-offset-4 hover:underline">{vendor.contact_email}</a> : null}
            {vendor.website ? <a href={vendor.website} target="_blank" rel="noreferrer" className="hover:text-ink underline-offset-4 hover:underline">site</a> : null}
          </div>
          {replyStatus?.awaiting_reply ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded border border-terracotta/30 bg-terracotta/5 px-3 py-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-terracotta animate-pulse" />
              <span className="text-terracotta">
                Awaiting your reply · {-daysUntil(replyStatus.last_inbound_at)}d since "{replyStatus.last_inbound_subject ?? "(no subject)"}"
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <VendorStatusChanger id={vendor.id} status={vendor.status} />
          <VendorMergeDialog vendorId={vendor.id} vendorName={vendor.name} targets={mergeTargets} />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 className="display text-[20px] italic">Estimates</h2>
          <AddEstimateForm vendorId={vendor.id} />
        </div>
        {vendor.estimates.length === 0 ? (
          <EmptyState title="No estimates yet" className="mt-5" />
        ) : (
          <table className="w-full mt-5">
            <thead className="text-[11px] uppercase tracking-widest text-ink-muted">
              <tr>
                <th className="text-left py-2">Package</th>
                <th className="text-left py-2">Received</th>
                <th className="text-left py-2">Status</th>
                <th className="text-right py-2">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {vendor.estimates.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 text-sm">{e.package_name ?? "—"}</td>
                  <td className="py-2.5 text-xs text-ink-muted">{formatDate(e.received_date)}</td>
                  <td className="py-2.5"><StatusBadge value={e.status} /></td>
                  <td className="py-2.5 text-right"><Money cents={e.total_amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-10">
        <h2 className="display text-[20px] italic border-b border-rule pb-2">Contracts &amp; payments</h2>
        {vendor.contracts.length === 0 ? (
          <EmptyState title="No contracts yet" description="Promote an estimate when ready." className="mt-5" />
        ) : (
          vendor.contracts.map((c) => (
            <div key={c.id} className="mt-5 rounded-md border border-rule bg-cream-soft/40">
              <div className="px-4 py-3 flex items-center justify-between border-b border-rule">
                <div>
                  <div className="text-sm display">Contract</div>
                  <div className="text-xs text-ink-muted">signed {formatDate(c.signed_date)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge value={c.status} />
                  <Money cents={c.total_contract_amount} />
                </div>
              </div>
              {c.payments.length === 0 ? (
                <div className="px-4 py-3 text-xs text-ink-muted">No payments scheduled.</div>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-rule">
                    {c.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-2.5 text-sm">{p.description}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-muted">{formatDate(p.due_date)}</td>
                        <td className="px-4 py-2.5 text-right"><Money cents={p.amount} /></td>
                        <td className="px-4 py-2.5">
                          <PayerChip
                            current={{ id: p.payer.id, name: p.payer.name, display_color: p.payer.display_color }}
                            payers={payersLite}
                            entity={{ type: "payment", id: p.id }}
                            size="sm"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {p.paid_date ? <span className="text-[11px] text-teal">paid</span> : <MarkPaidButton id={p.id} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))
        )}
      </section>

      {vendor.vendor_events.length > 0 ? (
        <section className="mt-10">
          <h2 className="display text-[20px] italic border-b border-rule pb-2">Events</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {vendor.vendor_events.map((ve) => (
              <span key={ve.event_id} className="rounded-full bg-cream-deep px-3 py-1 text-xs">{ve.event.name}</span>
            ))}
          </div>
        </section>
      ) : null}

      {emails.length > 0 ? (
        <section className="mt-10">
          <h2 className="display text-[20px] italic border-b border-rule pb-2">
            Emails <span className="text-[11px] uppercase tracking-widest text-ink-muted ml-2">{emails.length}</span>
          </h2>
          <VendorEmailsSection emails={emails} />
        </section>
      ) : null}

      {vendor.notes ? (
        <section className="mt-10">
          <h2 className="display text-[20px] italic border-b border-rule pb-2">Notes</h2>
          <p className="mt-4 text-sm text-ink-soft whitespace-pre-wrap">{vendor.notes}</p>
        </section>
      ) : null}
    </div>
  );
}
