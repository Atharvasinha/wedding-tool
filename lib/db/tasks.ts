import { prisma } from "@/lib/db/client";
import type { tasks as Task } from "@prisma/client";

export async function getAllOpenTasks() {
  return prisma.tasks.findMany({
    where: { status: { notIn: ["cancelled"] } },
    orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
    include: {
      linked_vendor: true,
      event: true,
      upstream_deps: { include: { upstream: { select: { id: true, title: true, status: true } } } },
    },
  });
}

export type TaskBucket = "behind" | "now" | "upcoming" | "complete";

export function bucketTask(due: Date | null, status: string): TaskBucket {
  if (status === "complete") return "complete";
  if (!due) return "upcoming";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(due);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return "behind";
  if (days <= 14) return "now";
  return "upcoming";
}

// True if this task has any incomplete upstream task — used to grey out the
// downstream card and surface a "blocked by X" badge.
export function isBlocked(
  task: { upstream_deps: { upstream: { status: string } }[] },
): boolean {
  return task.upstream_deps.some((d) => d.upstream.status !== "complete" && d.upstream.status !== "cancelled");
}

export async function searchTasks(query: string, excludeId?: string): Promise<Pick<Task, "id" | "title" | "status">[]> {
  return prisma.tasks.findMany({
    where: {
      AND: [
        excludeId ? { id: { not: excludeId } } : {},
        query
          ? { title: { contains: query, mode: "insensitive" } }
          : {},
      ],
    },
    take: 10,
    orderBy: { title: "asc" },
    select: { id: true, title: true, status: true },
  });
}
