"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { formatCents } from "@/lib/format";

const CreateSchema = z.object({
  contract_id: z.string().uuid().optional(),
  payer_id: z.string().uuid(),
  description: z.string().min(1).max(200),
  amount_cents: z.bigint(),
  due_date: z.string().date(),
});

export async function createPayment(input: z.infer<typeof CreateSchema>) {
  const data = CreateSchema.parse(input);
  const created = await prisma.payments.create({
    data: {
      contract_id: data.contract_id ?? null,
      payer_id: data.payer_id,
      description: data.description,
      amount: data.amount_cents,
      due_date: new Date(data.due_date),
    },
  });
  await logActivity({
    entityType: "payment",
    entityId: created.id,
    action: "created",
    summary: `Added ${formatCents(created.amount)} payment: ${created.description}`,
    after: { amount: created.amount, due_date: created.due_date, description: created.description },
  });
  revalidatePath("/", "layout");
  return created;
}

const MarkPaidSchema = z.object({
  id: z.string().uuid(),
  paid_date: z.string().date().optional(),
});

export async function markPaymentPaid(input: z.infer<typeof MarkPaidSchema>) {
  const { id, paid_date } = MarkPaidSchema.parse(input);
  const before = await prisma.payments.findUniqueOrThrow({ where: { id } });
  if (before.paid_date) return;
  const paid = paid_date ? new Date(paid_date) : new Date();
  await prisma.payments.update({
    where: { id },
    data: { paid_date: paid, updated_at: new Date() },
  });
  await logActivity({
    entityType: "payment",
    entityId: id,
    action: "marked_paid",
    summary: `Marked ${formatCents(before.amount)} paid: ${before.description}`,
    before: { paid_date: null },
    after: { paid_date: paid },
  });
  revalidatePath("/", "layout");
}

export async function unmarkPaymentPaid(id: string) {
  const before = await prisma.payments.findUniqueOrThrow({ where: { id } });
  if (!before.paid_date) return;
  await prisma.payments.update({ where: { id }, data: { paid_date: null, updated_at: new Date() } });
  await logActivity({
    entityType: "payment",
    entityId: id,
    action: "marked_unpaid",
    summary: `Reverted paid status: ${before.description}`,
    before: { paid_date: before.paid_date },
    after: { paid_date: null },
  });
  revalidatePath("/", "layout");
}
