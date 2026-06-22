"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Combine, X } from "lucide-react";
import { mergeVendor } from "@/lib/actions/vendors";

type Target = { id: string; name: string; category: string };

export function VendorMergeDialog({
  vendorId,
  vendorName,
  targets,
}: {
  vendorId: string;
  vendorName: string;
  targets: Target[];
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (targets.length === 0) return null;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        await mergeVendor({ source_vendor_id: vendorId, target_vendor_id: targetId });
        setOpen(false);
        router.push(`/vendors/${targetId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Merge failed");
      }
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-[11px] text-ink-muted hover:bg-cream-deep hover:text-ink">
          <Combine size={11} /> merge into another
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/30 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[480px] rounded-lg border border-rule bg-cream p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <Dialog.Title className="display text-[20px] italic">Merge vendor</Dialog.Title>
            <Dialog.Close asChild><button className="text-ink-muted hover:text-ink"><X size={18} /></button></Dialog.Close>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            All estimates, contracts, payments, linked events, and emails attached to{" "}
            <span className="font-medium">{vendorName}</span> will be moved to the target vendor.
            The source vendor will be archived.
          </p>
          <div className="mt-5">
            <label className="text-[11px] uppercase tracking-widest text-ink-muted">Merge into</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 w-full rounded border border-rule bg-cream-soft px-3 py-2 text-sm"
            >
              <option value="">— pick a vendor —</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {t.category.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          {error ? <div className="mt-3 text-xs text-terracotta">{error}</div> : null}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="px-3 py-2 text-sm text-ink-muted">Cancel</Dialog.Close>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !targetId}
              className="rounded-md bg-terracotta text-cream px-4 py-2 text-sm hover:bg-terracotta-deep disabled:opacity-50"
            >
              {pending ? "Merging…" : "Merge"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
