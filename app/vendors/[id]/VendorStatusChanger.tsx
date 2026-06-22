"use client";

import { useTransition } from "react";
import type { vendor_status } from "@prisma/client";
import { updateVendorStatus } from "@/lib/actions/vendors";

const STATUSES: vendor_status[] = [
  "researching", "contacted", "estimate_received", "comparing", "negotiating",
  "contract_sent", "contracted", "in_progress", "delivered", "declined", "archived",
];

export function VendorStatusChanger({ id, status }: { id: string; status: vendor_status }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-widest text-ink-muted mb-1">Status</div>
      <select
        value={status}
        disabled={pending}
        onChange={(e) => startTransition(() => updateVendorStatus({ id, status: e.target.value as vendor_status }))}
        className="rounded border border-rule bg-cream-soft px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta/50"
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}
