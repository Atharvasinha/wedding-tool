import { NextRequest, NextResponse } from "next/server";
import * as path from "node:path";
import * as fs from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One-shot seed endpoint. Bearer-gated by CRON_SECRET. Refuses to run if
// payers already exist (prevents accidental wipe of real data).
// Hit with:  curl -X POST -H "Authorization: Bearer <CRON_SECRET>" https://.../api/admin/seed

const PAYER_SEEDS = [
  { name: "Atharva's parents", type: "parent" as const, display_color: "#C9913A", display_order: 1 },
  { name: "Celesia's mom", type: "parent" as const, display_color: "#B8451E", display_order: 2 },
  { name: "Us · Atharva & Celesia", type: "couple" as const, display_color: "#3A6256", display_order: 3 },
] as const;

const PAYER_FOR_CATEGORY: Record<string, string> = {
  "Food & Beverage": "Celesia's mom",
  "Venue Fees": "Atharva's parents",
  "Guest Travel & Rooms": "Atharva's parents",
  "Misc Rentals": "Atharva's parents",
  "Attire": "Us · Atharva & Celesia",
  "Photography": "Us · Atharva & Celesia",
  "Planner / Coordination": "Atharva's parents",
  "Invites & Favors": "Us · Atharva & Celesia",
};

const FALLBACK_BUDGET = [
  { name: "Food & Beverage", baseline: 64625, planned: 64625, color: "#B8451E" },
  { name: "Venue Fees", baseline: 28435, planned: 28435, color: "#C9913A" },
  { name: "Guest Travel & Rooms", baseline: 23816, planned: 23816, color: "#C9913A" },
  { name: "Misc Rentals", baseline: 11500, planned: 11500, color: "#C9913A" },
  { name: "Attire", baseline: 10000, planned: 10000, color: "#3A6256" },
  { name: "Photography", baseline: 6200, planned: 6200, color: "#3A6256" },
  { name: "Planner / Coordination", baseline: 2000, planned: 2000, color: "#C9913A" },
  { name: "Invites & Favors", baseline: 1500, planned: 1500, color: "#3A6256" },
];

const EVENT_SEEDS = [
  { name: "Friday Sangeet", date: new Date("2027-12-10"), venue: "Camp Lucy · Sacred Oaks", color: "#C9913A", order: 1 },
  { name: "Saturday Vedic Ceremony", date: new Date("2027-12-11"), venue: "Camp Lucy", color: "#B8451E", order: 2 },
  { name: "Saturday Vedic Lunch", date: new Date("2027-12-11"), venue: "Camp Lucy", color: "#9A3F23", order: 3 },
  { name: "Saturday Western Ceremony", date: new Date("2027-12-11"), venue: "Camp Lucy", color: "#F1E9D7", order: 4 },
  { name: "Saturday Reception", date: new Date("2027-12-11"), venue: "Camp Lucy", color: "#3A6256", order: 5 },
  { name: "Sunday Brunch", date: new Date("2027-12-12"), venue: "Camp Lucy", color: "#C9913A", order: 6 },
];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // ?mode=tasks-only — re-seed only tasks (additive, used after fixing xlsx path)
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode === "tasks-only") {
    const tasks = parseTasks();
    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ ok: false, error: "No tasks parsed from xlsx" }, { status: 500 });
    }
    const existingTasks = await prisma.tasks.count();
    if (existingTasks > 0) {
      return NextResponse.json(
        { ok: false, error: `Already have ${existingTasks} tasks. Use ?mode=tasks-replace to wipe + reseed.` },
        { status: 409 },
      );
    }
    await prisma.$transaction(
      tasks.map((t) =>
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
    return NextResponse.json({ ok: true, mode: "tasks-only", tasks: tasks.length });
  }

  // Idempotency guard — refuse if data already seeded
  const existing = await prisma.payers.count();
  if (existing > 0) {
    return NextResponse.json(
      { ok: false, error: `Already seeded (${existing} payers exist). Refusing to clobber. Use ?mode=tasks-only to add tasks.` },
      { status: 409 },
    );
  }

  const counts = { payers: 0, events: 0, budget_categories: 0, tasks: 0 };

  // Payers
  const payerRows = await prisma.$transaction(
    PAYER_SEEDS.map((p) => prisma.payers.create({ data: p })),
  );
  counts.payers = payerRows.length;
  const payerByName = new Map(payerRows.map((p) => [p.name, p]));

  // Events
  await prisma.$transaction(
    EVENT_SEEDS.map((e) =>
      prisma.events.create({
        data: { name: e.name, date: e.date, venue: e.venue, display_color: e.color, display_order: e.order },
      }),
    ),
  );
  counts.events = EVENT_SEEDS.length;

  // Budget categories (xlsx with fallback)
  const budgetRows = parseBudget() ?? FALLBACK_BUDGET;
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
  counts.budget_categories = budgetRows.length;

  // Tasks (xlsx; skip if missing)
  const tasks = parseTasks();
  if (tasks && tasks.length) {
    await prisma.$transaction(
      tasks.map((t) =>
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
    counts.tasks = tasks.length;
  }

  return NextResponse.json({ ok: true, counts });
}

export const GET = POST;

// ─── xlsx parsing (inline copy from scripts/seed.ts so the route is standalone) ───

type ParsedBudget = { name: string; baseline: number; planned: number; color: string };
type ParsedTask = {
  title: string; category?: string; owner?: string; due_date?: Date; timeframe?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "not_started" | "in_progress" | "blocked" | "complete" | "cancelled";
};

function parseBudget(): ParsedBudget[] | null {
  const xlsxPath = path.join(process.cwd(), "public", "seed-data.xlsx");
  if (!fs.existsSync(xlsxPath)) return null;
  try {
    const wb = XLSX.readFile(xlsxPath);
    const sheetName = wb.SheetNames.find((n) => /budget/i.test(n)) ?? wb.SheetNames[0];
    if (!sheetName) return null;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: true });
    const COLORS = ["#B8451E", "#C9913A", "#3A6256", "#9A3F23", "#7A8B6B", "#C9913A", "#3A6256", "#B8451E"];
    const out: ParsedBudget[] = [];
    for (const row of rows) {
      const name = pickString(row, ["Category", "category", "Name", "name", "Line", "line"]);
      if (!name) continue;
      const baseline = pickNumber(row, ["Baseline", "baseline", "Locked", "locked", "Amount", "amount", "Total", "total"]);
      const planned = pickNumber(row, ["Planned", "planned", "Working", "working"]) ?? baseline;
      if (baseline == null) continue;
      out.push({ name: name.trim(), baseline, planned: planned ?? baseline, color: COLORS[out.length % COLORS.length] ?? "#736961" });
    }
    return out.length ? out : null;
  } catch { return null; }
}

function parseTasks(): ParsedTask[] | null {
  const xlsxPath = path.join(process.cwd(), "public", "seed-data.xlsx");
  if (!fs.existsSync(xlsxPath)) return null;
  try {
    const wb = XLSX.readFile(xlsxPath);
    const sheetName = wb.SheetNames.find((n) => /checklist|task/i.test(n));
    if (!sheetName) return null;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null, raw: true });
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
  } catch { return null; }
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
      const n = Number(v.replace(/[$,]/g, "").trim());
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
