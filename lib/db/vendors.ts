import { prisma } from "@/lib/db/client";
import type { vendor_status } from "@prisma/client";

export async function getActiveVendors() {
  return prisma.vendors.findMany({
    where: { archived_at: null, status: { notIn: ["declined", "archived"] } },
    orderBy: { updated_at: "desc" },
    include: {
      estimates: { orderBy: { received_date: "desc" } },
      contracts: { include: { payments: true } },
    },
  });
}

export async function getVendorById(id: string) {
  return prisma.vendors.findUnique({
    where: { id },
    include: {
      estimates: { orderBy: { received_date: "desc" } },
      contracts: { include: { payments: { include: { payer: true } } } },
      vendor_events: { include: { event: true } },
    },
  });
}

// Map fine-grained vendor_status enum to the 5 board columns.
export const KANBAN_COLUMNS = [
  { id: "researching", label: "Researching", statuses: ["researching"] },
  { id: "contacted", label: "Contacted", statuses: ["contacted"] },
  { id: "comparing", label: "Comparing", statuses: ["estimate_received", "comparing", "negotiating"] },
  { id: "contracted", label: "Contracted", statuses: ["contract_sent", "contracted", "in_progress"] },
  { id: "delivered", label: "Delivered", statuses: ["delivered"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly vendor_status[] }[];
