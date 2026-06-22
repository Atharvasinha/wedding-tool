"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import type { vendor_category, vendor_status } from "@prisma/client";

const VENDOR_CATEGORIES = [
  "venue", "catering", "photography", "videography", "dj_band", "florist",
  "rentals", "hair_makeup", "attire", "transportation", "stationery",
  "officiant", "priest", "planner", "accommodation", "other",
] as const;

const VENDOR_STATUSES = [
  "researching", "contacted", "estimate_received", "comparing", "negotiating",
  "contract_sent", "contracted", "in_progress", "delivered", "declined", "archived",
] as const;

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.enum(VENDOR_CATEGORIES),
  contact_email: z.string().email().optional().or(z.literal("")),
  contact_name: z.string().max(120).optional(),
  status: z.enum(VENDOR_STATUSES).default("researching"),
});

export async function createVendor(input: z.input<typeof CreateSchema>) {
  const data = CreateSchema.parse(input);
  const vendor = await prisma.vendors.create({
    data: {
      name: data.name,
      category: data.category as vendor_category,
      status: data.status as vendor_status,
      contact_email: data.contact_email || null,
      contact_name: data.contact_name || null,
    },
  });
  await logActivity({
    entityType: "vendor",
    entityId: vendor.id,
    action: "created",
    summary: `Added vendor: ${vendor.name}`,
    after: { name: vendor.name, category: vendor.category, status: vendor.status },
  });
  revalidatePath("/vendors");
  return vendor;
}

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(VENDOR_STATUSES),
});

export async function updateVendorStatus(input: z.infer<typeof UpdateStatusSchema>) {
  const { id, status } = UpdateStatusSchema.parse(input);
  const before = await prisma.vendors.findUniqueOrThrow({ where: { id } });
  if (before.status === status) return;
  await prisma.vendors.update({
    where: { id },
    data: { status: status as vendor_status, updated_at: new Date() },
  });
  await logActivity({
    entityType: "vendor",
    entityId: id,
    action: "status_changed",
    summary: `${before.name}: ${before.status} → ${status}`,
    before: { status: before.status },
    after: { status },
  });
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
}

const MergeSchema = z.object({
  source_vendor_id: z.string().uuid(),
  target_vendor_id: z.string().uuid(),
});

// Re-point all child records from source → target, then archive source.
// Single transaction so a failure doesn't leave the DB half-merged.
export async function mergeVendor(input: z.infer<typeof MergeSchema>) {
  const { source_vendor_id, target_vendor_id } = MergeSchema.parse(input);
  if (source_vendor_id === target_vendor_id) {
    throw new Error("Cannot merge a vendor into itself");
  }
  const [source, target] = await Promise.all([
    prisma.vendors.findUniqueOrThrow({ where: { id: source_vendor_id } }),
    prisma.vendors.findUniqueOrThrow({ where: { id: target_vendor_id } }),
  ]);
  if (source.archived_at) throw new Error(`${source.name} is already archived`);

  const counts = await prisma.$transaction(async (tx) => {
    const estimates = await tx.estimates.updateMany({
      where: { vendor_id: source_vendor_id },
      data: { vendor_id: target_vendor_id },
    });
    const contracts = await tx.contracts.updateMany({
      where: { vendor_id: source_vendor_id },
      data: { vendor_id: target_vendor_id },
    });
    const emails = await tx.email_items.updateMany({
      where: { suggested_vendor_id: source_vendor_id },
      data: { suggested_vendor_id: target_vendor_id },
    });
    const tasks = await tx.tasks.updateMany({
      where: { linked_vendor_id: source_vendor_id },
      data: { linked_vendor_id: target_vendor_id },
    });
    const receipts = await tx.receipts.updateMany({
      where: { vendor_id: source_vendor_id },
      data: { vendor_id: target_vendor_id },
    });

    // vendor_events: merge skipping duplicates (target already has the event)
    const sourceEvents = await tx.vendor_events.findMany({
      where: { vendor_id: source_vendor_id },
      select: { event_id: true },
    });
    const targetEvents = await tx.vendor_events.findMany({
      where: { vendor_id: target_vendor_id },
      select: { event_id: true },
    });
    const targetEventIds = new Set(targetEvents.map((e) => e.event_id));
    const toMove = sourceEvents.filter((e) => !targetEventIds.has(e.event_id));
    if (toMove.length) {
      await tx.vendor_events.createMany({
        data: toMove.map((e) => ({ vendor_id: target_vendor_id, event_id: e.event_id })),
      });
    }
    await tx.vendor_events.deleteMany({ where: { vendor_id: source_vendor_id } });

    // Soft-delete the source
    await tx.vendors.update({
      where: { id: source_vendor_id },
      data: { archived_at: new Date(), status: "archived", updated_at: new Date() },
    });

    return { estimates: estimates.count, contracts: contracts.count, emails: emails.count, tasks: tasks.count, receipts: receipts.count };
  });

  await logActivity({
    entityType: "vendor",
    entityId: target_vendor_id,
    action: "vendor_merged",
    summary: `Merged "${source.name}" into "${target.name}" (${counts.estimates} estimates, ${counts.contracts} contracts, ${counts.emails} emails, ${counts.tasks} tasks)`,
    before: { merged_vendor: source.name },
    after: counts,
  });

  revalidatePath("/vendors");
  revalidatePath(`/vendors/${target_vendor_id}`);
}
