"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { vendor_status } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { logActivity } from "@/lib/activity";
import { pollGmail, reparseAll } from "@/lib/gmail/poll";
import { formatCents } from "@/lib/format";

const Id = z.string().uuid();

// Advance vendor.status when an email-driven action makes a higher state obvious.
// Never moves backward. e.g. creating an estimate from email moves
// researching/contacted → estimate_received, but won't downgrade contracted.
const STATUS_ORDER: vendor_status[] = [
  "researching", "contacted", "estimate_received", "comparing", "negotiating",
  "contract_sent", "contracted", "in_progress", "delivered",
];

async function advanceVendorStatus(vendorId: string, target: vendor_status, reason: string) {
  const v = await prisma.vendors.findUniqueOrThrow({ where: { id: vendorId } });
  const fromIdx = STATUS_ORDER.indexOf(v.status);
  const toIdx = STATUS_ORDER.indexOf(target);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return; // never go backwards
  await prisma.vendors.update({
    where: { id: vendorId },
    data: { status: target, updated_at: new Date() },
  });
  await logActivity({
    entityType: "vendor",
    entityId: vendorId,
    action: "status_advanced",
    summary: `${v.name}: ${v.status} → ${target} (${reason})`,
    before: { status: v.status },
    after: { status: target },
  });
}

export async function snoozeEmail(id: string) {
  await prisma.email_items.update({
    where: { id: Id.parse(id) },
    data: { review_status: "snoozed", processed_at: null },
  });
  await logActivity({
    entityType: "email_item",
    entityId: id,
    action: "snoozed",
    summary: "Email snoozed for later",
  });
  revalidatePath("/inbox");
}

export async function ignoreEmail(id: string) {
  await prisma.email_items.update({
    where: { id: Id.parse(id) },
    data: { review_status: "ignored", processed_at: new Date() },
  });
  await logActivity({
    entityType: "email_item",
    entityId: id,
    action: "ignored",
    summary: "Email marked as ignored",
  });
  revalidatePath("/inbox");
}

export async function unsnoozeEmail(id: string) {
  await prisma.email_items.update({
    where: { id: Id.parse(id) },
    data: { review_status: "pending_review", processed_at: null },
  });
  revalidatePath("/inbox");
}

const AttachSchema = z.object({ emailId: z.string().uuid(), vendorId: z.string().uuid() });

export async function attachEmailToVendor(input: z.input<typeof AttachSchema>) {
  const { emailId, vendorId } = AttachSchema.parse(input);
  const [email, vendor] = await Promise.all([
    prisma.email_items.findUniqueOrThrow({ where: { id: emailId } }),
    prisma.vendors.findUniqueOrThrow({ where: { id: vendorId } }),
  ]);
  await prisma.email_items.update({
    where: { id: emailId },
    data: {
      suggested_vendor_id: vendorId,
      review_status: "processed",
      processed_at: new Date(),
    },
  });
  await logActivity({
    entityType: "email_item",
    entityId: emailId,
    action: "attached_to_vendor",
    summary: `Linked "${email.subject ?? "email"}" to ${vendor.name}`,
    after: { vendor: vendor.name },
  });
  revalidatePath("/inbox");
  revalidatePath(`/vendors/${vendorId}`);
}

const CreateEstimateSchema = z.object({
  emailId: z.string().uuid(),
  vendorId: z.string().uuid(),
  amount_cents: z.bigint(),
  package_name: z.string().max(120).optional(),
});

export async function createEstimateFromEmail(input: z.input<typeof CreateEstimateSchema>) {
  const data = CreateEstimateSchema.parse(input);
  const email = await prisma.email_items.findUniqueOrThrow({ where: { id: data.emailId } });
  const estimate = await prisma.estimates.create({
    data: {
      vendor_id: data.vendorId,
      total_amount: data.amount_cents,
      package_name: data.package_name ?? null,
      received_date: email.received_at,
      parsed_from_email_id: data.emailId,
    },
  });
  await prisma.email_items.update({
    where: { id: data.emailId },
    data: {
      suggested_vendor_id: data.vendorId,
      review_status: "processed",
      processed_at: new Date(),
    },
  });
  await logActivity({
    entityType: "estimate",
    entityId: estimate.id,
    action: "created_from_email",
    summary: `Created ${formatCents(data.amount_cents)} estimate from email`,
    after: { amount: data.amount_cents, source_email: email.subject },
  });
  await advanceVendorStatus(data.vendorId, "estimate_received", "estimate received via email");
  revalidatePath("/inbox");
  revalidatePath(`/vendors/${data.vendorId}`);
  revalidatePath("/vendors");
}

// ─── Payment from email ─────────────────────────────────

const CreatePaymentSchema = z.object({
  emailId: z.string().uuid(),
  vendorId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  amount_cents: z.bigint(),
  due_date: z.string().date(),
  description: z.string().min(1).max(200),
  already_paid: z.boolean().default(false),
  paid_date: z.string().date().optional(),
  payer_id: z.string().uuid().optional(),
});

export async function createPaymentFromEmail(input: z.input<typeof CreatePaymentSchema>) {
  const data = CreatePaymentSchema.parse(input);
  const email = await prisma.email_items.findUniqueOrThrow({ where: { id: data.emailId } });

  // Resolve payer: explicit > category default via vendor.category mapping > first payer
  let payerId = data.payer_id;
  if (!payerId) {
    const vendor = await prisma.vendors.findUniqueOrThrow({ where: { id: data.vendorId } });
    const cat = await prisma.budget_categories.findFirst({
      where: { name: { contains: vendorCategoryToBudget(vendor.category), mode: "insensitive" } },
      select: { default_payer_id: true },
    });
    payerId = cat?.default_payer_id ?? undefined;
  }
  if (!payerId) {
    const fallback = await prisma.payers.findFirst({ orderBy: { display_order: "asc" } });
    payerId = fallback?.id;
  }
  if (!payerId) throw new Error("No payer available — seed payers first");

  const payment = await prisma.payments.create({
    data: {
      contract_id: data.contractId ?? null,
      payer_id: payerId,
      description: data.description,
      amount: data.amount_cents,
      due_date: new Date(data.due_date),
      paid_date: data.already_paid ? new Date(data.paid_date ?? new Date()) : null,
    },
  });

  await prisma.email_items.update({
    where: { id: data.emailId },
    data: {
      suggested_vendor_id: data.vendorId,
      suggested_payment_id: payment.id,
      review_status: "processed",
      processed_at: new Date(),
    },
  });

  await logActivity({
    entityType: "payment",
    entityId: payment.id,
    action: "created_from_email",
    summary: `Created ${formatCents(data.amount_cents)} payment from email${data.already_paid ? " (already paid)" : ""}: ${data.description}`,
    after: { amount: data.amount_cents, due_date: data.due_date, source_email: email.subject },
  });

  // If this is the first payment activity, advance to in_progress
  if (data.already_paid) {
    await advanceVendorStatus(data.vendorId, "in_progress", "payment received");
  } else {
    await advanceVendorStatus(data.vendorId, "contracted", "invoice received");
  }

  revalidatePath("/inbox");
  revalidatePath(`/vendors/${data.vendorId}`);
  revalidatePath("/dashboard");
}

const MarkPaidFromEmailSchema = z.object({
  emailId: z.string().uuid(),
  paymentId: z.string().uuid(),
  paid_date: z.string().date().optional(),
});

export async function markPaymentPaidFromEmail(input: z.input<typeof MarkPaidFromEmailSchema>) {
  const data = MarkPaidFromEmailSchema.parse(input);
  const [email, payment] = await Promise.all([
    prisma.email_items.findUniqueOrThrow({ where: { id: data.emailId } }),
    prisma.payments.findUniqueOrThrow({
      where: { id: data.paymentId },
      include: { contract: { include: { vendor: true } } },
    }),
  ]);
  if (payment.paid_date) {
    // Already paid — just attach
    await prisma.email_items.update({
      where: { id: data.emailId },
      data: { suggested_payment_id: payment.id, review_status: "processed", processed_at: new Date() },
    });
    revalidatePath("/inbox");
    return;
  }
  const paidDate = data.paid_date ? new Date(data.paid_date) : email.received_at;
  await prisma.payments.update({
    where: { id: data.paymentId },
    data: { paid_date: paidDate, updated_at: new Date() },
  });
  await prisma.email_items.update({
    where: { id: data.emailId },
    data: { suggested_payment_id: payment.id, review_status: "processed", processed_at: new Date() },
  });
  await logActivity({
    entityType: "payment",
    entityId: payment.id,
    action: "marked_paid_from_email",
    summary: `Marked ${formatCents(payment.amount)} paid via email receipt: ${payment.description}`,
    before: { paid_date: null },
    after: { paid_date: paidDate, source_email: email.subject },
  });
  if (payment.contract?.vendor_id) {
    await advanceVendorStatus(payment.contract.vendor_id, "in_progress", "payment receipt processed");
  }
  revalidatePath("/inbox");
  revalidatePath("/dashboard");
}

// Map vendor_category enum → budget_category name (for default-payer lookup)
function vendorCategoryToBudget(cat: string): string {
  const map: Record<string, string> = {
    venue: "Venue", catering: "Food & Beverage", photography: "Photography",
    videography: "Photography", florist: "Misc Rentals", rentals: "Misc Rentals",
    dj_band: "Misc Rentals", attire: "Attire", hair_makeup: "Attire",
    transportation: "Guest Travel", accommodation: "Guest Travel",
    stationery: "Invites", planner: "Planner", priest: "Planner", officiant: "Planner",
  };
  return map[cat] ?? cat;
}

const CreateVendorSchema = z.object({
  emailId: z.string().uuid(),
  name: z.string().min(1).max(120),
  category: z.string().min(1),
});

export async function createVendorFromEmail(input: z.input<typeof CreateVendorSchema>) {
  const data = CreateVendorSchema.parse(input);
  const email = await prisma.email_items.findUniqueOrThrow({ where: { id: data.emailId } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendor = await prisma.vendors.create({
    data: {
      name: data.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: data.category as any,
      contact_email: email.from_address,
      contact_name: email.from_name ?? null,
    },
  });
  await prisma.email_items.update({
    where: { id: data.emailId },
    data: {
      suggested_vendor_id: vendor.id,
      review_status: "processed",
      processed_at: new Date(),
    },
  });
  await logActivity({
    entityType: "vendor",
    entityId: vendor.id,
    action: "created_from_email",
    summary: `Created vendor "${vendor.name}" from email`,
    after: { name: vendor.name, contact: email.from_address },
  });
  revalidatePath("/inbox");
  revalidatePath("/vendors");
}

export async function triggerPoll() {
  const result = await pollGmail();
  revalidatePath("/inbox");
  return result;
}

export async function triggerReparse() {
  const result = await reparseAll();
  revalidatePath("/inbox");
  return result;
}

// AI triage via Haiku 4.5. Returns a Suggestion that the EmailCard renders
// in place of the rules-based one. Does NOT auto-apply — user still confirms.
export async function aiSuggestEmail(emailId: string) {
  const { aiSuggestForEmail } = await import("@/lib/parsing/llm");
  const email = await prisma.email_items.findUniqueOrThrow({ where: { id: Id.parse(emailId) } });
  const result = await aiSuggestForEmail(email);

  // Persist the AI's vendor-guess update so future polls/reparses benefit too
  if (
    result.suggestion.kind !== "review" &&
    "defaults" in result.suggestion &&
    "vendorId" in result.suggestion.defaults
  ) {
    await prisma.email_items.update({
      where: { id: emailId },
      data: { suggested_vendor_id: result.suggestion.defaults.vendorId },
    });
  }

  await logActivity({
    entityType: "email_item",
    entityId: emailId,
    action: "ai_triaged",
    summary: `Haiku suggested: ${result.suggestion.kind} — ${result.suggestion.reason}`,
    after: { kind: result.suggestion.kind, tokens: result.usage },
  });

  return result;
}
