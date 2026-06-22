"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createVendor } from "@/lib/actions/vendors";

const CATEGORIES = [
  "venue", "catering", "photography", "videography", "dj_band", "florist",
  "rentals", "hair_makeup", "attire", "transportation", "stationery",
  "officiant", "priest", "planner", "accommodation", "other",
] as const;

export function AddVendorDialog() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("venue");
  const [email, setEmail] = useState("");

  function submit() {
    startTransition(async () => {
      await createVendor({ name: name.trim(), category, contact_email: email.trim() || undefined });
      setName(""); setEmail(""); setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-ink text-cream px-3 py-2 text-sm hover:bg-ink-soft">
          <Plus size={14} /> Add vendor
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] rounded-lg border border-rule bg-cream p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="display text-[20px] italic">New vendor</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-ink-muted hover:text-ink"><X size={18} /></button>
            </Dialog.Close>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <Field label="Name">
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value as never)} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="Contact email (optional)">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} />
            </Field>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="px-3 py-2 text-sm text-ink-muted">Cancel</Dialog.Close>
            <button
              type="button"
              disabled={pending || !name.trim()}
              onClick={submit}
              className="rounded-md bg-terracotta text-cream px-4 py-2 text-sm hover:bg-terracotta-deep disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add vendor"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const inputCls = "rounded border border-rule bg-cream-soft px-3 py-2 text-sm focus:outline-none focus:border-terracotta/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-widest text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
