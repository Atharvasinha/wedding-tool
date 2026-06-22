import { getAllOpenTasks, bucketTask, type TaskBucket } from "@/lib/db/tasks";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { AddTaskDialog } from "./AddTaskDialog";
import { TaskStatusToggle } from "./TaskStatusToggle";
import { formatDate, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COLUMNS: { id: TaskBucket; title: string; hint: string }[] = [
  { id: "behind", title: "Behind schedule", hint: "due date passed" },
  { id: "now", title: "Now", hint: "next 14 days" },
  { id: "upcoming", title: "Upcoming", hint: "later or no date" },
];

export default async function TasksPage() {
  const tasks = await getAllOpenTasks();
  const buckets = new Map<TaskBucket, typeof tasks>();
  for (const t of tasks) {
    const b = bucketTask(t.due_date, t.status);
    if (b === "complete") continue;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b)!.push(t);
  }

  return (
    <div className="px-10 py-9">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-muted mono uppercase tracking-widest">Tasks</div>
          <h1 className="display text-[36px] leading-tight mt-1">What's next</h1>
        </div>
        <AddTaskDialog />
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet" description="Seed loads the master checklist; or add tasks manually." className="mt-10" />
      ) : (
        <div className="mt-8 grid grid-cols-3 gap-6">
          {COLUMNS.map((col) => {
            const items = buckets.get(col.id) ?? [];
            const accent = col.id === "behind" ? "text-terracotta" : col.id === "now" ? "text-gold" : "text-ink-soft";
            return (
              <div key={col.id}>
                <div className="flex items-baseline justify-between border-b border-rule pb-2">
                  <h3 className={cn("display text-[18px] italic", accent)}>{col.title}</h3>
                  <span className="text-[11px] uppercase tracking-widest text-ink-muted">
                    {col.hint} · <span className="mono tabular">{items.length}</span>
                  </span>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {items.length === 0 ? (
                    <div className="text-[11px] text-ink-muted/70 italic px-1">—</div>
                  ) : (
                    items.map((t) => <TaskCard key={t.id} t={t} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskCard({ t }: { t: Awaited<ReturnType<typeof getAllOpenTasks>>[number] }) {
  const days = t.due_date ? daysUntil(t.due_date) : null;
  const dueLabel = days === null ? "no date" : days < 0 ? `${-days}d overdue` : days === 0 ? "today" : `in ${days}d`;
  const dueClass = days === null ? "text-ink-muted" : days < 0 ? "text-terracotta" : days <= 7 ? "text-gold" : "text-ink-muted";

  return (
    <div className="rounded-md border border-rule bg-cream-soft p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm leading-snug flex-1">{t.title}</div>
        <TaskStatusToggle id={t.id} status={t.status} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2">
          {t.category ? <span className="text-ink-muted">{t.category}</span> : null}
          {t.linked_vendor ? <span className="text-teal">→ {t.linked_vendor.name}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={t.priority} />
          <span className={cn("mono tabular", dueClass)} title={formatDate(t.due_date)}>{dueLabel}</span>
        </div>
      </div>
    </div>
  );
}
