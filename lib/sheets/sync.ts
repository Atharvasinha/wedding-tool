// Full-overwrite sync from Postgres → Google Sheets. One tab per entity.
// Decisions from CLAUDE.md "Open items":
//   - email_items_parsed tab includes parsed columns only, no body/attachments
//   - Always full overwrite (no incremental), so the sheet can't drift
//   - Row 1 of every tab has a "Last synced: ISO" marker followed by headers

import type { sheets_v4 } from "googleapis";
import { prisma } from "@/lib/db/client";
import { getSheetsClient, getSheetId } from "./client";

type Tab = {
  name: string;
  headers: string[];
  rows: (string | number | null)[][];
};

export async function syncToSheets(): Promise<{ tabs: number; rows_total: number; elapsed_ms: number }> {
  const t0 = Date.now();
  const sheets = getSheetsClient();
  const sheetId = getSheetId();

  // Snapshot every entity in parallel — single transaction window for consistency
  const [payers, events, categories, vendors, estimates, contracts, payments, tasks, emails, activity] =
    await Promise.all([
      prisma.payers.findMany({ orderBy: { display_order: "asc" } }),
      prisma.events.findMany({ orderBy: { display_order: "asc" } }),
      prisma.budget_categories.findMany({
        orderBy: { display_order: "asc" },
        include: { default_payer: { select: { name: true } } },
      }),
      prisma.vendors.findMany({ orderBy: { updated_at: "desc" } }),
      prisma.estimates.findMany({
        orderBy: { received_date: "desc" },
        include: { vendor: { select: { name: true } } },
      }),
      prisma.contracts.findMany({
        orderBy: { signed_date: "desc" },
        include: { vendor: { select: { name: true } } },
      }),
      prisma.payments.findMany({
        orderBy: { due_date: "asc" },
        include: {
          payer: { select: { name: true } },
          contract: { include: { vendor: { select: { name: true } } } },
        },
      }),
      prisma.tasks.findMany({
        orderBy: [{ due_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
      }),
      // email_items: PARSED COLUMNS ONLY per locked decision (no body, no attachments)
      prisma.email_items.findMany({
        where: { direction: "incoming" },
        orderBy: { received_at: "desc" },
        take: 500,
        select: {
          received_at: true,
          from_address: true,
          subject: true,
          parsed_intent: true,
          parsed_amount: true,
          parsed_vendor_guess: true,
          review_status: true,
        },
      }),
      prisma.activity_log.findMany({ orderBy: { created_at: "desc" }, take: 500 }),
    ]);

  const tabs: Tab[] = [
    {
      name: "Payers",
      headers: ["name", "type", "color", "total_committed", "notes"],
      rows: payers.map((p) => [
        p.name,
        p.type,
        p.display_color,
        bigintToDollars(p.total_committed),
        p.notes ?? "",
      ]),
    },
    {
      name: "Events",
      headers: ["name", "date", "venue", "description", "color"],
      rows: events.map((e) => [
        e.name,
        toIsoDate(e.date),
        e.venue ?? "",
        e.description ?? "",
        e.display_color,
      ]),
    },
    {
      name: "Budget Categories",
      headers: ["category", "baseline_dollars", "planned_dollars", "default_payer", "notes"],
      rows: categories.map((c) => [
        c.name,
        bigintToDollars(c.baseline_amount) ?? "",
        bigintToDollars(c.planned_amount) ?? "",
        c.default_payer?.name ?? "",
        c.notes ?? "",
      ]),
    },
    {
      name: "Vendors",
      headers: ["name", "category", "status", "contact_name", "contact_email", "website", "created", "updated"],
      rows: vendors.map((v) => [
        v.name,
        v.category,
        v.status,
        v.contact_name ?? "",
        v.contact_email ?? "",
        v.website ?? "",
        toIsoDate(v.created_at),
        toIsoDate(v.updated_at),
      ]),
    },
    {
      name: "Estimates",
      headers: ["vendor", "package", "amount_dollars", "received_date", "expires_date", "status", "notes"],
      rows: estimates.map((e) => [
        e.vendor.name,
        e.package_name ?? "",
        bigintToDollars(e.total_amount) ?? "",
        toIsoDate(e.received_date),
        toIsoDate(e.expires_date),
        e.status,
        e.notes ?? "",
      ]),
    },
    {
      name: "Contracts",
      headers: ["vendor", "total_dollars", "signed_date", "status", "deliverables", "cancellation_terms"],
      rows: contracts.map((c) => [
        c.vendor.name,
        bigintToDollars(c.total_contract_amount) ?? "",
        toIsoDate(c.signed_date),
        c.status,
        c.deliverables_summary ?? "",
        c.cancellation_terms ?? "",
      ]),
    },
    {
      name: "Payments",
      headers: ["description", "vendor", "amount_dollars", "due_date", "paid_date", "payer", "method"],
      rows: payments.map((p) => [
        p.description,
        p.contract?.vendor.name ?? "—",
        bigintToDollars(p.amount) ?? "",
        toIsoDate(p.due_date),
        toIsoDate(p.paid_date),
        p.payer.name,
        p.payment_method ?? "",
      ]),
    },
    {
      name: "Tasks",
      headers: ["title", "category", "owner", "status", "priority", "due_date", "timeframe"],
      rows: tasks.map((t) => [
        t.title,
        t.category ?? "",
        t.owner ?? "",
        t.status,
        t.priority,
        toIsoDate(t.due_date),
        t.timeframe_label ?? "",
      ]),
    },
    {
      name: "Email Items (parsed)",
      headers: ["received_at", "from_address", "subject", "parsed_intent", "parsed_amount_dollars", "parsed_vendor_guess", "review_status"],
      rows: emails.map((e) => [
        toIsoTimestamp(e.received_at),
        e.from_address,
        e.subject ?? "",
        e.parsed_intent,
        bigintToDollars(e.parsed_amount) ?? "",
        e.parsed_vendor_guess ?? "",
        e.review_status,
      ]),
    },
    {
      name: "Activity Log",
      headers: ["timestamp", "entity_type", "action", "changed_by", "summary"],
      rows: activity.map((a) => [
        toIsoTimestamp(a.created_at),
        a.entity_type,
        a.action,
        a.changed_by,
        a.diff_summary ?? "",
      ]),
    },
  ];

  // Make sure every tab exists in the spreadsheet — create missing ones
  await ensureTabsExist(sheets, sheetId, tabs.map((t) => t.name));

  const syncStamp = `Last synced: ${new Date().toISOString()}`;

  // Write each tab
  let totalRows = 0;
  for (const tab of tabs) {
    // Clear the tab first
    await sheets.spreadsheets.values.clear({
      spreadsheetId: sheetId,
      range: `'${tab.name}'!A1:Z`,
    });
    // Build the values: row 1 = sync stamp, row 2 = headers, row 3+ = data
    const values: (string | number | null)[][] = [
      [syncStamp],
      tab.headers,
      ...tab.rows,
    ];
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `'${tab.name}'!A1`,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    totalRows += tab.rows.length;
  }

  return { tabs: tabs.length, rows_total: totalRows, elapsed_ms: Date.now() - t0 };
}

async function ensureTabsExist(sheets: sheets_v4.Sheets, sheetId: string, names: string[]) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""));
  const toCreate = names.filter((n) => !existing.has(n));
  if (toCreate.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })),
    },
  });
}

// ─── Formatting helpers ──────────────────────────────────

function bigintToDollars(cents: bigint | number | null | undefined): number | null {
  if (cents == null) return null;
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return Math.round((n / 100) * 100) / 100; // dollars with 2 decimals
}

function toIsoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function toIsoTimestamp(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString();
}
