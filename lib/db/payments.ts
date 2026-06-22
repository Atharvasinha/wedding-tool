import { prisma } from "@/lib/db/client";

export async function getUpcomingPayments(limit = 5) {
  return prisma.payments.findMany({
    where: { paid_date: null },
    orderBy: { due_date: "asc" },
    take: limit,
    include: {
      payer: true,
      contract: { include: { vendor: true } },
    },
  });
}

export async function getPaymentsForCategory(categoryName: string) {
  // Phase 1: vendor.category enum doesn't 1:1 with budget_categories.name.
  // Drill-down sums payments whose contract's vendor matches the budget category
  // string, plus one-off payments with the category name in description.
  return prisma.payments.findMany({
    where: {
      OR: [
        { contract: { vendor: { category: matchesCategory(categoryName) } } },
        { description: { contains: categoryName, mode: "insensitive" } },
      ],
    },
    orderBy: { due_date: "asc" },
    include: { payer: true, contract: { include: { vendor: true } } },
  });
}

function matchesCategory(name: string) {
  const map: Record<string, string> = {
    "Food & Beverage": "catering",
    "Venue Fees": "venue",
    "Guest Travel & Rooms": "accommodation",
    "Misc Rentals": "rentals",
    "Attire": "attire",
    "Photography": "photography",
    "Planner / Coordination": "planner",
    "Invites & Favors": "stationery",
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return map[name] as any;
}
