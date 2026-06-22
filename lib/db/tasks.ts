import { prisma } from "@/lib/db/client";

export async function getAllOpenTasks() {
  return prisma.tasks.findMany({
    where: { status: { notIn: ["cancelled"] } },
    orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
    include: { linked_vendor: true, event: true },
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
