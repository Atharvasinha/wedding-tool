"use client";

import { useState, useTransition } from "react";
import { updatePayer } from "@/lib/actions/payers";
import { formatCents } from "@/lib/format";
import { parseDollars } from "@/lib/utils";

type Props = {
  id: string;
  name: string;
  color: string;
  cap: bigint | null;
};

export function PayerRow({ id, name, color, cap }: Props) {
  const [pending, startTransition] = useTransition();
  const [draftName, setDraftName] = useState(name);
  const [draftColor, setDraftColor] = useState(color);
  const [draftCap, setDraftCap] = useState(cap ? formatCents(cap) : "");

  function commitName() {
    if (draftName === name || !draftName.trim()) return;
    startTransition(() => updatePayer({ id, name: draftName.trim() }));
  }
  function commitColor() {
    if (draftColor === color) return;
    startTransition(() => updatePayer({ id, display_color: draftColor }));
  }
  function commitCap() {
    const next = draftCap.trim() ? parseDollars(draftCap) : null;
    if ((next === null && cap === null) || next === cap) return;
    startTransition(() => updatePayer({ id, total_committed_cents: next }));
  }

  return (
    <tr className="hover:bg-cream-soft/60">
      <td className="px-4 py-2.5">
        <input
          type="color"
          value={draftColor}
          onChange={(e) => setDraftColor(e.target.value)}
          onBlur={commitColor}
          disabled={pending}
          className="h-7 w-10 cursor-pointer rounded border border-rule"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          disabled={pending}
          className="bg-transparent w-full text-sm outline-none focus:bg-cream rounded px-1.5 py-0.5"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <input
          value={draftCap}
          onChange={(e) => setDraftCap(e.target.value)}
          onBlur={commitCap}
          disabled={pending}
          placeholder="—"
          className="bg-transparent text-right tabular mono w-32 outline-none focus:bg-cream rounded px-1.5 py-0.5"
        />
      </td>
      <td />
    </tr>
  );
}
