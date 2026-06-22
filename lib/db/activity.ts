import { prisma } from "@/lib/db/client";

export async function getRecentActivity(limit = 10) {
  return prisma.activity_log.findMany({
    orderBy: { created_at: "desc" },
    take: limit,
  });
}
