"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { triggerPoll, triggerReparse } from "@/lib/actions/email";

export function PollNowButton({ enabled }: { enabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!enabled) return null;

  return (
    <div className="flex items-center gap-3">
      {msg ? <div className="text-xs text-ink-muted">{msg}</div> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            try {
              const r = await triggerReparse();
              setMsg(`re-parsed ${r.updated}`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "failed");
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-rule bg-cream px-3 py-2 text-xs text-ink-soft hover:bg-cream-deep disabled:opacity-50"
        title="Re-run parsers on existing pending emails"
      >
        reparse
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            try {
              const r = await triggerPoll();
              setMsg(`+${r.inserted} new (${r.fetched} fetched${r.errors.length ? `, ${r.errors.length} errors` : ""})`);
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "failed");
            }
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md bg-ink text-cream px-3 py-2 text-sm hover:bg-ink-soft disabled:opacity-50"
      >
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {pending ? "Polling…" : "Poll now"}
      </button>
    </div>
  );
}
