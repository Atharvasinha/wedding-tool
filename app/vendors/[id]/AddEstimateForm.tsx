"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createEstimate } from "@/lib/actions/estimates";
import { parseDollars } from "@/lib/utils";

export function AddEstimateForm({ vendorId }: { vendorId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [pkg, setPkg] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
        <Plus size={12} /> add estimate
      </button>
    );
  }

  function submit() {
    const cents = parseDollars(amount);
    if (!cents) return;
    startTransition(async () => {
      await createEstimate({ vendor_id: vendorId, total_amount_cents: cents, package_name: pkg || undefined });
      setAmount(""); setPkg(""); setOpen(false);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        placeholder="Package"
        value={pkg}
        onChange={(e) => setPkg(e.target.value)}
        className="rounded border border-rule bg-cream-soft px-2 py-1 text-xs"
      />
      <input
        placeholder="$"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="rounded border border-rule bg-cream-soft px-2 py-1 text-xs w-24 tabular mono"
      />
      <button onClick={submit} disabled={pending} className="rounded bg-ink text-cream px-2 py-1 text-xs disabled:opacity-50">
        {pending ? "…" : "save"}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-ink-muted">cancel</button>
    </div>
  );
}
