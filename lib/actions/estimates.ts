"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { formatCents } from "@/lib/format";

const CreateSchema = z.object({
  vendor_id: z.string().uuid(),
  total_amount_cents: z.bigint(),
  package_name: z.string().max(120).optional(),
  received_date: z.string().date().optional(),
});

export async function createEstimate(input: z.infer<typeof CreateSchema>) {
  const data = CreateSchema.parse(input);
  const created = await prisma.estimates.create({
    data: {
      vendor_id: data.vendor_id,
      total_amount: data.total_amount_cents,
      package_name: data.package_name || null,
      received_date: data.received_date ? new Date(data.received_date) : new Date(),
    },
  });
  await logActivity({
    entityType: "estimate",
    entityId: created.id,
    action: "created",
    summary: `Added ${formatCents(created.total_amount)} estimate`,
    after: { amount: created.total_amount },
  });
  revalidatePath(`/vendors/${data.vendor_id}`);
  return created;
}
