"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { changePayer, createPayer } from "@/lib/actions/payers";
import { cn } from "@/lib/utils";

export type PayerLite = { id: string; name: string; display_color: string };

type Props = {
  current: PayerLite | null;
  payers: PayerLite[];
  entity: { type: "budget_category" | "payment"; id: string };
  size?: "sm" | "md";
  readOnly?: boolean;
};

export function PayerChip({ current, payers, entity, size = "md", readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);

  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-cream-soft transition-colors",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        readOnly ? "cursor-default" : "cursor-pointer hover:bg-cream-deep",
        pending && "opacity-60",
      )}
      style={{ borderColor: current?.display_color ?? "var(--rule)" }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: current?.display_color ?? "#999" }}
      />
      <span className="text-ink-soft">{current?.name ?? "Unassigned"}</span>
    </span>
  );

  if (readOnly) return chip;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" disabled={pending} className="outline-none focus-visible:ring-2 focus-visible:ring-terracotta/50 rounded-full">
          {chip}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-60 rounded-lg border border-rule bg-cream shadow-lg p-1.5 animate-in fade-in"
        >
          {payers.map((p) => {
            const isCurrent = p.id === current?.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={pending}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-cream-deep"
                onClick={() => {
                  startTransition(async () => {
                    await changePayer({ entityType: entity.type, entityId: entity.id, newPayerId: p.id });
                    setOpen(false);
                  });
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.display_color }} />
                <span className="flex-1">{p.name}</span>
                {isCurrent ? <Check size={14} className="text-teal" /> : null}
              </button>
            );
          })}
          <div className="my-1 h-px bg-rule" />
          {addOpen ? (
            <AddPayerInline onDone={() => { setAddOpen(false); setOpen(false); }} />
          ) : (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink-muted hover:bg-cream-deep"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={14} /> Add new payer
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AddPayerInline({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7A8B6B");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2 px-2.5 py-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Payer name"
        className="rounded border border-rule bg-cream px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-rule"
        />
        <button
          type="button"
          disabled={pending || !name.trim()}
          className="flex-1 rounded bg-ink px-2 py-1 text-xs text-cream disabled:opacity-50"
          onClick={() => {
            startTransition(async () => {
              await createPayer({ name: name.trim(), display_color: color });
              onDone();
            });
          }}
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button type="button" className="text-xs text-ink-muted" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
