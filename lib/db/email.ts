import { prisma } from "@/lib/db/client";

export async function getInboxItems() {
  const [pending, snoozed, processed] = await Promise.all([
    prisma.email_items.findMany({
      where: { review_status: "pending_review", direction: "incoming" },
      orderBy: { received_at: "desc" },
      include: { suggested_vendor: true },
    }),
    prisma.email_items.findMany({
      where: { review_status: "snoozed", direction: "incoming" },
      orderBy: { received_at: "desc" },
      include: { suggested_vendor: true },
    }),
    prisma.email_items.findMany({
      where: { review_status: { in: ["processed", "ignored"] }, direction: "incoming" },
      orderBy: { processed_at: "desc" },
      take: 15,
      include: { suggested_vendor: true },
    }),
  ]);
  // Annotate each incoming email with "awaiting reply" by checking if a more
  // recent outgoing email exists in the same thread.
  const allInbound = [...pending, ...snoozed, ...processed];
  const threadIds = Array.from(new Set(allInbound.map((e) => e.thread_id).filter((t): t is string => !!t)));
  const outgoingByThread = new Map<string, Date>();
  if (threadIds.length) {
    const outgoing = await prisma.email_items.findMany({
      where: { direction: "outgoing", thread_id: { in: threadIds } },
      select: { thread_id: true, received_at: true },
    });
    for (const o of outgoing) {
      if (!o.thread_id) continue;
      const existing = outgoingByThread.get(o.thread_id);
      if (!existing || o.received_at > existing) outgoingByThread.set(o.thread_id, o.received_at);
    }
  }
  const annotate = <T extends { thread_id: string | null; received_at: Date }>(rows: T[]) =>
    rows.map((r) => ({
      ...r,
      awaiting_reply: r.thread_id
        ? !outgoingByThread.has(r.thread_id) || outgoingByThread.get(r.thread_id)! < r.received_at
        : false,
    }));

  return { pending: annotate(pending), snoozed: annotate(snoozed), processed: annotate(processed) };
}

export async function getEmailsForVendor(vendorId: string) {
  return prisma.email_items.findMany({
    where: { suggested_vendor_id: vendorId },
    orderBy: { received_at: "desc" },
    take: 50,
  });
}

// "Awaiting reply": the most recent message in this vendor's thread is incoming
// (from them), and the user hasn't sent anything more recent than it.
export async function getVendorReplyStatus(vendorId: string) {
  const emails = await prisma.email_items.findMany({
    where: { suggested_vendor_id: vendorId },
    orderBy: { received_at: "desc" },
    select: { id: true, subject: true, thread_id: true, received_at: true, direction: true },
  });
  if (emails.length === 0) return null;
  const lastInbound = emails.find((e) => e.direction === "incoming");
  if (!lastInbound) return null;
  // Find any outbound in the same thread that came after the last inbound
  const reply = emails.find(
    (e) =>
      e.direction === "outgoing" &&
      e.thread_id &&
      e.thread_id === lastInbound.thread_id &&
      e.received_at > lastInbound.received_at,
  );
  return {
    awaiting_reply: !reply,
    last_inbound_at: lastInbound.received_at,
    last_inbound_subject: lastInbound.subject,
  };
}
