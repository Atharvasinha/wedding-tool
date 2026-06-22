import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Money({
  cents,
  className,
  muted,
}: {
  cents: bigint | number | null | undefined;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn("tabular mono", muted && "text-ink-muted", className)}>
      {formatCents(cents)}
    </span>
  );
}
