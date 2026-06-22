"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createTask } from "@/lib/actions/tasks";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

export function AddTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await createTask({
        title: title.trim(),
        category: category.trim() || undefined,
        owner: owner.trim() || undefined,
        due_date: due || undefined,
        priority,
      });
      setTitle(""); setCategory(""); setOwner(""); setDue(""); setOpen(false);
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-ink text-cream px-3 py-2 text-sm hover:bg-ink-soft">
          <Plus size={14} /> Add task
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] rounded-lg border border-rule bg-cream p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="display text-[20px] italic">New task</Dialog.Title>
            <Dialog.Close asChild><button className="text-ink-muted hover:text-ink"><X size={18} /></button></Dialog.Close>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            <Field label="Title">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></Field>
              <Field label="Owner"><input value={owner} onChange={(e) => setOwner(e.target.value)} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due date"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></Field>
              <Field label="Priority">
                <select value={priority} onChange={(e) => setPriority(e.target.value as never)} className={inputCls}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="px-3 py-2 text-sm text-ink-muted">Cancel</Dialog.Close>
            <button onClick={submit} disabled={pending || !title.trim()} className="rounded-md bg-terracotta text-cream px-4 py-2 text-sm hover:bg-terracotta-deep disabled:opacity-50">
              {pending ? "Adding…" : "Add task"}
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
