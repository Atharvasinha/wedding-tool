"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { formatCents } from "@/lib/format";

const UpdatePlannedSchema = z.object({
  id: z.string().uuid(),
  planned_cents: z.union([z.bigint(), z.string()]).transform((v) => {
    if (typeof v === "bigint") return v;
    return BigInt(v);
  }),
});

export async function updatePlannedAmount(input: { id: string; planned_cents: bigint | string }) {
  const { id, planned_cents } = UpdatePlannedSchema.parse(input);
  const before = await prisma.budget_categories.findUniqueOrThrow({ where: { id } });
  if (before.planned_amount === planned_cents) return;

  await prisma.budget_categories.update({
    where: { id },
    data: { planned_amount: planned_cents, updated_at: new Date() },
  });

  await logActivity({
    entityType: "budget_category",
    entityId: id,
    action: "planned_amount_changed",
    summary: `${before.name}: ${formatCents(before.planned_amount)} → ${formatCents(planned_cents)}`,
    before: { planned: before.planned_amount },
    after: { planned: planned_cents },
  });

  revalidatePath("/", "layout");
}

const UpdateNotesSchema = z.object({ id: z.string().uuid(), notes: z.string().nullable() });

export async function updateBudgetNotes(input: z.infer<typeof UpdateNotesSchema>) {
  const { id, notes } = UpdateNotesSchema.parse(input);
  await prisma.budget_categories.update({ where: { id }, data: { notes, updated_at: new Date() } });
  revalidatePath("/budget");
}
