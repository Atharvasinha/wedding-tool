"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import type { task_priority, task_status } from "@prisma/client";

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
