"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { searchTasks } from "@/lib/db/tasks";
import type { task_priority, task_status } from "@prisma/client";

export async function searchTasksAction(query: string, excludeId?: string) {
  return searchTasks(query, excludeId);
}

const TASK_STATUSES = ["not_started", "in_progress", "blocked", "complete", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().max(80).optional(),
  owner: z.string().max(120).optional(),
  due_date: z.string().date().optional(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
});

export async function createTask(input: z.input<typeof CreateSchema>) {
  const data = CreateSchema.parse(input);
  const created = await prisma.tasks.create({
    data: {
      title: data.title,
      category: data.category || null,
      owner: data.owner || null,
      due_date: data.due_date ? new Date(data.due_date) : null,
      priority: data.priority as task_priority,
      source: "manual",
    },
  });
  await logActivity({
    entityType: "task",
    entityId: created.id,
    action: "created",
    summary: `Added task: ${created.title}`,
    after: { title: created.title, due_date: created.due_date },
  });
  revalidatePath("/tasks");
  return created;
}

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(TASK_STATUSES),
});

export async function updateTaskStatus(input: z.infer<typeof UpdateStatusSchema>) {
  const { id, status } = UpdateStatusSchema.parse(input);
  const before = await prisma.tasks.findUniqueOrThrow({ where: { id } });
  if (before.status === status) return;
  await prisma.tasks.update({
    where: { id },
    data: {
      status: status as task_status,
      completed_at: status === "complete" ? new Date() : null,
      updated_at: new Date(),
    },
  });
  await logActivity({
    entityType: "task",
    entityId: id,
    action: "status_changed",
    summary: `"${before.title}": ${before.status} → ${status}`,
    before: { status: before.status },
    after: { status },
  });
  revalidatePath("/tasks");
}

// ─── Dependencies ────────────────────────────────────────

const AddDepSchema = z.object({
  downstream_task_id: z.string().uuid(),
  upstream_task_id: z.string().uuid(),
});

export async function addTaskDependency(input: z.input<typeof AddDepSchema>) {
  const data = AddDepSchema.parse(input);
  if (data.downstream_task_id === data.upstream_task_id) {
    throw new Error("A task can't depend on itself");
  }
  // Cycle check: walk ancestors of the proposed upstream — if downstream appears, abort
  const visited = new Set<string>();
  const queue = [data.upstream_task_id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === data.downstream_task_id) {
      throw new Error("Would create a dependency cycle");
    }
    const parents = await prisma.task_dependencies.findMany({
      where: { downstream_task_id: current },
      select: { upstream_task_id: true },
    });
    for (const p of parents) queue.push(p.upstream_task_id);
  }
  const [downstream, upstream] = await Promise.all([
    prisma.tasks.findUniqueOrThrow({ where: { id: data.downstream_task_id } }),
    prisma.tasks.findUniqueOrThrow({ where: { id: data.upstream_task_id } }),
  ]);
  await prisma.task_dependencies.create({
    data: {
      downstream_task_id: data.downstream_task_id,
      upstream_task_id: data.upstream_task_id,
    },
  });
  await logActivity({
    entityType: "task",
    entityId: data.downstream_task_id,
    action: "dependency_added",
    summary: `"${downstream.title}" now blocked by "${upstream.title}"`,
  });
  revalidatePath("/tasks");
}

export async function removeTaskDependency(downstreamId: string, upstreamId: string) {
  const row = await prisma.task_dependencies.findUnique({
    where: { upstream_task_id_downstream_task_id: { upstream_task_id: upstreamId, downstream_task_id: downstreamId } },
  });
  if (!row) return;
  await prisma.task_dependencies.delete({ where: { id: row.id } });
  const downstream = await prisma.tasks.findUnique({ where: { id: downstreamId } });
  await logActivity({
    entityType: "task",
    entityId: downstreamId,
    action: "dependency_removed",
    summary: `Removed dependency from "${downstream?.title ?? "?"}"`,
  });
  revalidatePath("/tasks");
}
