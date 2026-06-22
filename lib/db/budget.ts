import { prisma } from "@/lib/db/client";

export async function getBudgetCategories() {
  return prisma.budget_categories.findMany({
    orderBy: { display_order: "asc" },
    include: { default_payer: true },
  });
}

export async function getBudgetCategory(id: string) {
  return prisma.budget_categories.findUnique({
    where: { id },
    include: { default_payer: true },
  });
}

export type BudgetTotals = {
  planned: bigint;
  baseline: bigint;
  committed: bigint;
  paid: bigint;
};

export async function getBudgetTotals(): Promise<BudgetTotals> {
  const [cats, contracts, payments] = await Promise.all([
    prisma.budget_categories.aggregate({
      _sum: { planned_amount: true, baseline_amount: true },
    }),
    prisma.contracts.aggregate({
      _sum: { total_contract_amount: true },
      where: { status: { notIn: ["draft", "cancelled"] } },
    }),
    prisma.payments.aggregate({
      _sum: { amount: true },
      where: { paid_date: { not: null } },
    }),
  ]);

  return {
    planned: cats._sum.planned_amount ?? 0n,
    baseline: cats._sum.baseline_amount ?? 0n,
    committed: contracts._sum.total_contract_amount ?? 0n,
    paid: payments._sum.amount ?? 0n,
  };
}
