import { getRecentActivity } from "@/lib/db/activity";
import { formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

// Server component. Drop into any page where a recent-activity rail is useful.
// Pass `compact` for a slimmer version (used on the global right-rail).
export async function ActivityFeed({ limit = 10, compact = false }: { limit?: number; compact?: boolean }) {
  const activity = await getRecentActivity(limit);

  if (activity.length === 0) {
    return (
      <div className={cn("text-xs italic", compact ? "text-ink-muted/70 px-3 py-2" : "text-ink-muted")}>
        Quiet so far
      </div>
    );
  }

  return (
    <ul className={cn(compact ? "space-y-2.5" : "space-y-3")}>
      {activity.map((a) => (
        <li key={a.id} className={cn("text-xs text-ink-soft", compact && "px-3")}>
          <div className="text-ink-muted mono text-[10px]">{formatDateShort(a.created_at)}</div>
          <div className="leading-snug">{a.diff_summary ?? `${a.action} · ${a.entity_type}`}</div>
        </li>
      ))}
    </ul>
  );
}
