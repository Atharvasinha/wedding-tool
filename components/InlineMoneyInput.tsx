"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/format";
import { parseDollars } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Props = {
  cents: bigint;
  onCommit: (cents: bigint) => Promise<void>;
  className?: string;
};

export function InlineMoneyInput({ cents, onCommit, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatCents(cents));
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        className={cn("text-right tabular mono hover:bg-cream-deep rounded px-1.5 py-0.5", className)}
        onClick={() => { setDraft(formatCents(cents)); setEditing(true); }}
      >
        {formatCents(cents)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(formatCents(cents)); setEditing(false); }
      }}
      onBlur={() => {
        const parsed = parseDollars(draft);
        setEditing(false);
        if (parsed === null || parsed === cents) return;
        startTransition(() => onCommit(parsed));
      }}
      disabled={pending}
      className={cn(
        "text-right tabular mono bg-cream border border-terracotta/40 rounded px-1.5 py-0.5 w-28 outline-none",
        className,
      )}
    />
  );
}
