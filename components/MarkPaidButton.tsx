"use client";

import { useTransition } from "react";
import { markPaymentPaid } from "@/lib/actions/payments";
import { Check } from "lucide-react";

export function MarkPaidButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-0.5 text-[11px] text-ink-muted hover:bg-cream-deep hover:text-ink disabled:opacity-50"
      onClick={() => startTransition(() => markPaymentPaid({ id }))}
    >
      <Check size={11} /> mark paid
    </button>
  );
}
