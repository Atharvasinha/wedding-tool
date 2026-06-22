"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createPayer } from "@/lib/actions/payers";

export function AddPayerInline() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7A8B6B");
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <Plus size={14} /> Add payer
      </button>
    );
  }

  function submit() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createPayer({ name: name.trim(), display_color: color });
      setName(""); setOpen(false);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-rule"
      />
      <input
        autoFocus
        placeholder="Payer name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-rule bg-cream-soft px-3 py-2 text-sm"
      />
      <button onClick={submit} disabled={pending || !name.trim()} className="rounded bg-ink text-cream px-3 py-2 text-sm disabled:opacity-50">
        {pending ? "Adding…" : "Add"}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-ink-muted">cancel</button>
    </div>
  );
}
