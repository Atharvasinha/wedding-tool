import { prisma } from "@/lib/db/client";

export async function getAllPayers() {
  return prisma.payers.findMany({ orderBy: { display_order: "asc" } });
}

export async function getPayerById(id: string) {
  return prisma.payers.findUnique({ where: { id } });
}
