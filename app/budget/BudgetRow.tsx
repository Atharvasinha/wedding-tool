"use client";

import Link from "next/link";
import { Money } from "@/components/Money";
import { PayerChip, type PayerLite } from "@/components/PayerChip";
import { InlineMoneyInput } from "@/components/InlineMoneyInput";
import { updatePlannedAmount, updateBudgetNotes } from "@/lib/actions/budget";
import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";

type Props = {
  id: string;
  name: string;
  baseline: bigint;
  planned: bigint;
  notes: string | null;
  payer: PayerLite | null;
  payers: PayerLite[];
};

export function BudgetRow({ id, name, baseline, planned, notes, payer, payers }: Props) {
  return (
    <tr className="hover:bg-cream-soft/60 transition-colors">
      <td className="px-4 py-3">
        <Link href={`/budget/${id}` as never} className="text-sm hover:underline">
          {name}
        </Link>
      </td>
      <td className="px-4 py-3 text-right">
        <Money cents={baseline} muted />
      </td>
      <td className="px-4 py-3 text-right">
        <InlineMoneyInput
          cents={planned}
          onCommit={(cents) => updatePlannedAmount({ id, planned_cents: cents })}
        />
      </td>
      <td className="px-4 py-3">
        <PayerChip
          current={payer}
          payers={payers}
          entity={{ type: "budget_category", id }}
          size="sm"
        />
      </td>
      <td className="px-4 py-3 w-[28%]">
        <NotesCell id={id} notes={notes} />
      </td>
      <td className="px-2 py-3 text-ink-muted">
        <Link href={`/budget/${id}` as never} aria-label="drill down">
          <ChevronRight size={16} />
        </Link>
      </td>
    </tr>
  );
}

function NotesCell({ id, notes }: { id: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const next = value.trim() || null;
        if (next === notes) return;
        startTransition(() => updateBudgetNotes({ id, notes: next }));
      }}
      disabled={pending}
      placeholder="—"
      className="w-full bg-transparent text-xs text-ink-soft placeholder:text-ink-muted/60 outline-none focus:bg-cream rounded px-1.5 py-0.5"
    />
  );
}
