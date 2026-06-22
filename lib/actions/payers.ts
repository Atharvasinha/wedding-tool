"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import type { payer_type } from "@prisma/client";

const PayerEntityType = z.enum(["budget_category", "payment"]);
type PayerEntityType = z.infer<typeof PayerEntityType>;

const ChangePayerSchema = z.object({
  entityType: PayerEntityType,
  entityId: z.string().uuid(),
  newPayerId: z.string().uuid(),
});

export async function changePayer(input: z.infer<typeof ChangePayerSchema>) {
  const { entityType, entityId, newPayerId } = ChangePayerSchema.parse(input);
  const newPayer = await prisma.payers.findUniqueOrThrow({ where: { id: newPayerId } });

  if (entityType === "budget_category") {
    const before = await prisma.budget_categories.findUniqueOrThrow({
      where: { id: entityId },
      include: { default_payer: true },
    });
    if (before.default_payer_id === newPayerId) return;
    await prisma.budget_categories.update({
      where: { id: entityId },
      data: { default_payer_id: newPayerId, updated_at: new Date() },
    });
    await logActivity({
      entityType: "budget_category",
      entityId,
      action: "default_payer_changed",
      summary: `Default payer: ${before.default_payer?.name ?? "(none)"} → ${newPayer.name}`,
      before: { payer: before.default_payer?.name ?? null },
      after: { payer: newPayer.name },
    });
  } else {
    const before = await prisma.payments.findUniqueOrThrow({
      where: { id: entityId },
      include: { payer: true },
    });
    if (before.payer_id === newPayerId) return;
    await prisma.payments.update({
      where: { id: entityId },
      data: { payer_id: newPayerId, updated_at: new Date() },
    });
    await logActivity({
      entityType: "payment",
      entityId,
      action: "payer_changed",
      summary: `Payer: ${before.payer.name} → ${newPayer.name} for "${before.description}"`,
      before: { payer: before.payer.name },
      after: { payer: newPayer.name },
    });
  }

  revalidatePath("/", "layout");
}

const CreatePayerSchema = z.object({
  name: z.string().min(1).max(80),
  display_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  type: z.string().default("other"),
});

export async function createPayer(input: z.input<typeof CreatePayerSchema>) {
  const data = CreatePayerSchema.parse(input);
  const count = await prisma.payers.count();
  const created = await prisma.payers.create({
    data: {
      name: data.name,
      display_color: data.display_color,
      type: data.type as payer_type,
      display_order: count + 1,
    },
  });
  await logActivity({
    entityType: "payer",
    entityId: created.id,
    action: "created",
    summary: `Added payer: ${created.name}`,
    after: { name: created.name, color: created.display_color },
  });
  revalidatePath("/", "layout");
  return created;
}

const UpdatePayerSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80).optional(),
  display_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  total_committed_cents: z.bigint().nullable().optional(),
});

export async function updatePayer(input: z.infer<typeof UpdatePayerSchema>) {
  const { id, total_committed_cents, ...rest } = UpdatePayerSchema.parse(input);
  const before = await prisma.payers.findUniqueOrThrow({ where: { id } });
  await prisma.payers.update({
    where: { id },
    data: {
      ...rest,
      ...(total_committed_cents !== undefined ? { total_committed: total_committed_cents } : {}),
      updated_at: new Date(),
    },
  });
  await logActivity({
    entityType: "payer",
    entityId: id,
    action: "updated",
    summary: `Updated payer: ${before.name}`,
    before,
    after: { ...before, ...rest, ...(total_committed_cents !== undefined ? { total_committed: total_committed_cents } : {}) },
  });
  revalidatePath("/", "layout");
}
