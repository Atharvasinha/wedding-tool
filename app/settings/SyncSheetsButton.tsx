"use client";

import { useState, useTransition } from "react";
import { Sheet, RefreshCw } from "lucide-react";
import { triggerSheetsSync } from "@/lib/actions/sheets";

export function SyncSheetsButton({ configured }: { configured: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="text-xs text-ink-muted">
        <Sheet size={12} className="inline mr-1" />
        Sheets mirror not configured. Set <code className="mono">SHEETS_MIRROR_ID</code> in env to enable.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="text-xs text-ink-muted">{msg}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            try {
              const r = await triggerSheetsSync();
              setMsg(`Synced ${r.tabs} tabs · ${r.rows_total} rows · ${r.elapsed_ms}ms`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Sync failed");
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-cream px-3 py-1.5 text-xs text-ink-soft hover:bg-cream-deep disabled:opacity-50"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
        {pending ? "Syncing…" : "Sync to Sheet now"}
      </button>
    </div>
  );
}
