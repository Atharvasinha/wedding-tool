"use client";

import { useTransition } from "react";
import type { task_status } from "@prisma/client";
import { Check } from "lucide-react";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { cn } from "@/lib/utils";

export function TaskStatusToggle({ id, status }: { id: string; status: task_status }) {
  const [pending, startTransition] = useTransition();
  const isComplete = status === "complete";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => updateTaskStatus({ id, status: isComplete ? "not_started" : "complete" }))}
      className={cn(
        "h-5 w-5 shrink-0 rounded border flex items-center justify-center",
        isComplete ? "bg-sage border-sage text-cream" : "border-rule bg-cream hover:border-ink-muted",
      )}
      aria-label={isComplete ? "Mark not done" : "Mark done"}
    >
      {isComplete ? <Check size={12} /> : null}
    </button>
  );
}
