"use client";

import { useState, useTransition } from "react";
import { Lock, Plus, X } from "lucide-react";
import { addTaskDependency, removeTaskDependency, searchTasksAction } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

type Dep = { upstream_id: string; title: string; status: string };

export function TaskCardActions({
  taskId,
  taskTitle,
  currentDeps,
}: {
  taskId: string;
  taskTitle: string;
  currentDeps: Dep[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; status: string }[]>([]);

  const search = (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const r = await searchTasksAction(q, taskId);
      setResults(r);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-[10px] text-ink-muted hover:text-ink inline-flex items-center gap-1"
      >
        <Lock size={9} /> {currentDeps.length > 0 ? `manage ${currentDeps.length} dep${currentDeps.length === 1 ? "" : "s"}` : "add dependency"}
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-dashed border-rule">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-ink-muted">Blocked by</div>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">
          <X size={11} />
        </button>
      </div>

      {currentDeps.length > 0 ? (
        <div className="space-y-1 mb-3">
          {currentDeps.map((d) => (
            <div key={d.upstream_id} className="flex items-center justify-between gap-2 text-[11px] bg-cream rounded px-2 py-1">
              <span className={cn(
                "truncate",
                d.status === "complete" ? "text-ink-muted line-through" : "text-ink-soft",
              )}>
                {d.title}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => removeTaskDependency(taskId, d.upstream_id))}
                className="text-ink-muted hover:text-terracotta shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <input
        placeholder="search tasks…"
        value={query}
        onChange={(e) => search(e.target.value)}
        className="w-full rounded border border-rule bg-cream px-2 py-1 text-[11px] outline-none"
      />
      {results.length > 0 ? (
        <div className="mt-1 max-h-32 overflow-y-auto rounded border border-rule bg-cream">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  try {
                    await addTaskDependency({ downstream_task_id: taskId, upstream_task_id: r.id });
                    setQuery("");
                    setResults([]);
                  } catch {
                    // cycle or duplicate; ignore silently
                  }
                });
              }}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 text-[11px] hover:bg-cream-deep"
              title={`Block "${taskTitle}" on "${r.title}"`}
            >
              <Plus size={9} />
              <span className="truncate">{r.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
