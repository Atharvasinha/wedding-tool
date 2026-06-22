import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed border-rule bg-cream-soft/50 p-8 text-center", className)}>
      <div className="display text-lg italic text-ink-soft">{title}</div>
      {description ? <div className="text-sm text-ink-muted mt-1">{description}</div> : null}
    </div>
  );
}
