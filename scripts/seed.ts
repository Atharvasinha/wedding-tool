import { PrismaClient, Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import * as path from "node:path";
import * as fs from "node:fs";

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────
// PAYERS — exact match to CLAUDE.md "The three payers" table
// ────────────────────────────────────────────────────────────────
const PAYER_SEEDS = [
  { name: "Atharva's parents",     type: "parent" as const, display_color: "#C9913A", display_order: 1 },
  { name: "Celesia's mom",         type: "parent" as const, display_color: "#B8451E", display_order: 2 },
  { name: "Us · Atharva & Celesia", type: "couple" as const, display_color: "#3A6256", display_order: 3 },
] as const;

// Default-payer mapping from CLAUDE.md "The locked budget"
const PAYER_FOR_CATEGORY: Record<string, string> = {
  "Food & Beverage":        "Celesia's mom",
  "Venue Fees":             "Atharva's parents",
  "Guest Travel & Rooms":   "Atharva's parents",
  "Misc Rentals":           "Atharva's parents",
  "Attire":                 "Us · Atharva & Celesia",
  "Photography":            "Us · Atharva & Celesia",
  "Planner / Coordination": "Atharva's parents",
  "Invites & Favors":       "Us · Atharva & Celesia",
};

// Fallback budget rows (from CLAUDE.md) if seed-data.xlsx isn't present or its
// budget tab doesn't parse. The amounts are the locked-baseline working values.
const FALLBACK_BUDGET: { name: string; baseline: number; planned: number; color: string }[] = [
  { name: "Food & Beverage",        baseline: 64625, planned: 64625, color: "#B8451E" },
  { name: "Venue Fees",             baseline: 28435, planned: 28435, color: "#C9913A" },
  { name: "Guest Travel & Rooms",   baseline: 23816, planned: 23816, color: "#C9913A" },
  { name: "Misc Rentals",           baseline: 11500, planned: 11500, color: "#C9913A" },
  { name: "Attire",                 baseline: 10000, planned: 10000, color: "#3A6256" },
  { name: "Photography",            baseline:  6200, planned:  6200, color: "#3A6256" },
  { name: "Planner / Coordination", baseline:  2000, planned:  2000, color: "#C9913A" },
  { name: "Invites & Favors",       baseline:  1500, planned:  1500, color: "#3A6256" },
];

const EVENT_SEEDS = [
  { name: "Friday Sangeet",            date: new Date("2027-12-10"), venue: "Camp Lucy · Sacred Oaks", color: "#C9913A", order: 1 },
  { name: "Saturday Vedic Ceremony",   date: new Date("2027-12-11"), venue: "Camp Lucy",               color: "#B8451E", order: 2 },
  { name: "Saturday Vedic Lunch",      date: new Date("2027-12-11"), venue: "Camp Lucy",               color: "#9A3F23", order: 3 },
  { name: "Saturday Western Ceremony", date: new Date("2027-12-11"), venue: "Camp Lucy",               color: "#F1E9D7", order: 4 },
  { name: "Saturday Reception",        date: new Date("2027-12-11"), venue: "Camp Lucy",               color: "#3A6256", order: 5 },
  { name: "Sunday Brunch",             date: new Date("2027-12-12"), venue: "Camp Lucy",               color: "#C9913A", order: 6 },
];

async function main() {
  console.log("→ Clearing existing seed data");
  // Phase 1 only: nukes everything. Remove this once real data exists.
  await prisma.activity_log.deleteMany();
  await prisma.task_dependencies.deleteMany();
  await prisma.tasks.deleteMany();
  await prisma.receipts.deleteMany();
  await prisma.payments.deleteMany();
  await prisma.contracts.deleteMany();
  await prisma.estimates.deleteMany();
  await prisma.vendor_events.deleteMany();
  await prisma.vendors.deleteMany();
  await prisma.email_items.deleteMany();
  await prisma.budget_categories.deleteMany();
  await prisma.events.deleteMany();
  await prisma.payers.deleteMany();

  console.log("→ Seeding payers");
  const payerRows = await prisma.$transaction(
    PAYER_SEEDS.map((p) => prisma.payers.create({ data: p })),
  );
  const payerByName = new Map(payerRows.map((p) => [p.name, p]));

  console.log("→ Seeding events");
  await prisma.$transaction(
    EVENT_SEEDS.map((e) =>
      prisma.events.create({
        data: {
          name: e.name,
          date: e.date,
          venue: e.venue,
          display_color: e.color,
          display_order: e.order,
        },
      }),
    ),
  );

  // ──────────────────────────────────────────────────────────────
  // BUDGET CATEGORIES — parse seed-data.xlsx, fall back to constants
  // ──────────────────────────────────────────────────────────────
  console.log("→ Seeding budget categories");
  const budgetRows = await parseBudgetFromXlsx().catch((err) => {
    console.warn(`   xlsx parse failed (${err.message}); using fallback from CLAUDE.md`);
    return FALLBACK_BUDGET;
  });

  for (const [i, row] of budgetRows.entries()) {
    const payer = payerByName.get(PAYER_FOR_CATEGORY[row.name] ?? "");
    await prisma.budget_categories.create({
      data: {
        name: row.name,
        baseline_amount: BigInt(Math.round(row.baseline * 100)),
        planned_amount: BigInt(Math.round(row.planned * 100)),
        display_color: row.color,
        display_order: i + 1,
        default_payer_id: payer?.id ?? null,
      },
    });
  }
  const totalBaseline = budgetRows.reduce((s, r) => s + r.baseline, 0);
  console.log(`   ${budgetRows.length} categories · baseline total $${totalBaseline.toLocaleString()}`);

  // ──────────────────────────────────────────────────────────────
  // TASKS — parse seed-data.xlsx master checklist; skip if missing
  // ──────────────────────────────────────────────────────────────
  console.log("→ Seeding tasks");
  const taskRows = await parseTasksFromXlsx().catch((err) => {
    console.warn(`   xlsx tasks parse failed (${err.message}); skipping`);
    return [] as ParsedTask[];
  });

  if (taskRows.length) {
    await prisma.$transaction(
      taskRows.map((t) =>
        prisma.tasks.create({
          data: {
            title: t.title,
            category: t.category ?? null,
            owner: t.owner ?? null,
            due_date: t.due_date ?? null,
            timeframe_label: t.timeframe ?? null,
            priority: t.priority,
            status: t.status,
            source: "template",
          },
        }),
      ),
    );
    console.log(`   ${taskRows.length} tasks seeded`);
  }

  console.log("✓ Seed complete");
}

// ──────────────────────────────────────────────────────────────
// XLSX PARSERS
// ──────────────────────────────────────────────────────────────

type ParsedBudget = { name: string; baseline: number; planned: number; color: string };

async function parseBudgetFromXlsx(): Promise<ParsedBudget[]> {
  const xlsxPath = path.join(process.cwd(), "seed-data.xlsx");
  if (!fs.existsSync(xlsxPath)) throw new Error("seed-data.xlsx not found");

  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames.find((n) => /budget/i.test(n)) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error("no sheets in xlsx");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: null,
    raw: true,
  });

  const out: ParsedBudget[] = [];
  const COLORS = ["#B8451E", "#C9913A", "#3A6256", "#9A3F23", "#7A8B6B", "#C9913A", "#3A6256", "#B8451E"];

  for (const row of rows) {
    const name = pickString(row, ["Category", "category", "Name", "name", "Line", "line"]);
    if (!name) continue;
    const baseline = pickNumber(row, ["Baseline", "baseline", "Locked", "locked", "Amount", "amount", "Total", "total"]);
    const planned = pickNumber(row, ["Planned", "planned", "Working", "working"]) ?? baseline;
    if (baseline == null) continue;
    out.push({
      name: name.trim(),
      baseline,
      planned: planned ?? baseline,
      color: COLORS[out.length % COLORS.length] ?? "#736961",
    });
  }
  if (out.length === 0) throw new Error("no budget rows parsed");
  return out;
}

type ParsedTask = {
  title: string;
  category?: string;
  owner?: string;
  due_date?: Date;
  timeframe?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "not_started" | "in_progress" | "blocked" | "complete" | "cancelled";
};

async function parseTasksFromXlsx(): Promise<ParsedTask[]> {
  const xlsxPath = path.join(process.cwd(), "seed-data.xlsx");
  if (!fs.existsSync(xlsxPath)) throw new Error("seed-data.xlsx not found");

  const wb = XLSX.readFile(xlsxPath);
  const sheetName = wb.SheetNames.find((n) => /checklist|task/i.test(n));
  if (!sheetName) throw new Error("no checklist sheet found");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: null,
    raw: true,
  });

  const out: ParsedTask[] = [];
  for (const row of rows) {
    const title = pickString(row, ["Task", "task", "Title", "title", "Item", "item"]);
    if (!title) continue;
    out.push({
      title: title.trim(),
      category: pickString(row, ["Category", "category", "Area", "area"]) ?? undefined,
      owner: pickString(row, ["Owner", "owner", "Assignee", "assignee"]) ?? undefined,
      due_date: pickDate(row, ["Due", "due", "Due date", "Due Date"]) ?? undefined,
      timeframe: pickString(row, ["Timeframe", "timeframe", "When", "when"]) ?? undefined,
      priority: (pickString(row, ["Priority", "priority"])?.toLowerCase() as ParsedTask["priority"]) ?? "medium",
      status: parseStatus(pickString(row, ["Status", "status", "Done", "done"])),
    });
  }
  return out;
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const cleaned = v.replace(/[$,]/g, "").trim();
      const n = Number(cleaned);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function pickDate(row: Record<string, unknown>, keys: string[]): Date | null {
  for (const k of keys) {
    const v = row[k];
    if (v instanceof Date) return v;
    if (typeof v === "number") {
      // Excel serial date
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + v * 86_400_000);
    }
    if (typeof v === "string" && v.trim()) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function parseStatus(s: string | null): ParsedTask["status"] {
  if (!s) return "not_started";
  const v = s.toLowerCase().trim();
  if (["done", "complete", "completed", "yes", "true", "x"].includes(v)) return "complete";
  if (["in progress", "in_progress", "doing", "wip"].includes(v)) return "in_progress";
  if (["blocked", "stuck"].includes(v)) return "blocked";
  if (["cancelled", "canceled"].includes(v)) return "cancelled";
  return "not_started";
}

// Silence Prisma "unused" warning in single-file scripts
void Prisma;

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
