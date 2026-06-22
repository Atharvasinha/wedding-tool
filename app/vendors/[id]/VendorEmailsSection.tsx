import type { email_items } from "@prisma/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/Money";
import { formatDate } from "@/lib/format";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function VendorEmailsSection({ emails }: { emails: email_items[] }) {
  return (
    <div className="mt-4 divide-y divide-rule rounded-md border border-rule bg-cream-soft/40">
      {emails.map((e) => (
        <div key={e.id} className="px-4 py-3 grid grid-cols-[14px_1fr_auto_auto_auto] items-center gap-3">
          <span title={e.direction === "outgoing" ? "Sent" : "Received"}>
            {e.direction === "outgoing" ? (
              <ArrowUpRight size={14} className="text-teal" />
            ) : (
              <ArrowDownRight size={14} className="text-ink-muted" />
            )}
          </span>
          <div className="min-w-0">
            <div className="text-sm leading-snug truncate">{e.subject ?? "(no subject)"}</div>
            <div className="text-[11px] text-ink-muted mt-0.5 truncate">
              {e.from_address} · {formatDate(e.received_at)}
            </div>
          </div>
          <div className="text-xs">
            {e.parsed_amount ? <Money cents={e.parsed_amount} className="text-xs" /> : null}
          </div>
          <StatusBadge value={e.parsed_intent} />
          <span className="text-[10px] uppercase tracking-widest text-ink-muted">
            {e.review_status.replace(/_/g, " ")}
          </span>
        </div>
      ))}
    </div>
  );
}
