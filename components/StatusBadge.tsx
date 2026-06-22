import { cn } from "@/lib/utils";

const PRESETS: Record<string, string> = {
  // task / vendor / contract
  not_started: "bg-cream-deep text-ink-soft",
  in_progress: "bg-gold/20 text-gold border border-gold/40",
  blocked: "bg-terracotta/15 text-terracotta border border-terracotta/40",
  complete: "bg-sage/20 text-sage border border-sage/40",
  cancelled: "bg-ink-muted/20 text-ink-muted",

  researching: "bg-cream-deep text-ink-soft",
  contacted: "bg-cream-deep text-ink-soft",
  estimate_received: "bg-gold/20 text-gold",
  comparing: "bg-gold/20 text-gold",
  negotiating: "bg-gold/20 text-gold",
  contract_sent: "bg-teal/15 text-teal",
  contracted: "bg-teal/15 text-teal",
  delivered: "bg-sage/20 text-sage",
  declined: "bg-ink-muted/20 text-ink-muted",
  archived: "bg-ink-muted/20 text-ink-muted",

  draft: "bg-cream-deep text-ink-soft",
  sent_for_signature: "bg-gold/20 text-gold",
  signed: "bg-teal/15 text-teal",
  completed: "bg-sage/20 text-sage",
  disputed: "bg-terracotta/15 text-terracotta",

  low: "bg-cream-deep text-ink-soft",
  medium: "bg-gold/15 text-gold",
  high: "bg-terracotta/15 text-terracotta",
  critical: "bg-terracotta text-cream",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const label = value.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        PRESETS[value] ?? "bg-cream-deep text-ink-soft",
        className,
      )}
    >
      {label}
    </span>
  );
}
