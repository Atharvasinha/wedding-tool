import { Suspense } from "react";
import { ActivityFeed } from "./ActivityFeed";

// Right-rail recent activity. Hidden on small screens (the nav is mobile-first
// concern). Suspense lets the page render while the activity query runs.
export function GlobalActivityRail() {
  return (
    <aside className="w-64 shrink-0 border-l border-rule bg-cream-soft/40 px-4 py-7 hidden xl:block">
      <div className="text-[10px] uppercase tracking-widest text-ink-muted mb-3 px-3">
        Recent activity
      </div>
      <Suspense fallback={<div className="text-xs text-ink-muted/70 italic px-3">loading…</div>}>
        <ActivityFeed limit={12} compact />
      </Suspense>
    </aside>
  );
}
