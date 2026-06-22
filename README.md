# Wedding Tool

A planning app for Atharva & Celesia's wedding. December 11, 2027. Camp Lucy, Texas.

## Files in this repo

| File | Purpose |
|---|---|
| `CLAUDE.md` | Working rules for Claude Code. Read first. |
| `design-spec.html` | Visual design spec with 5 fully-rendered screen mockups. Open in a browser. |
| `seed-data.xlsx` | The original wedding planning spreadsheet — budget, tasks, guest list, cost benchmarks. |
| `schema.sql` | Initial Postgres schema for the 6 core tables. |
| `INITIAL_PROMPT.md` | The first prompt to send Claude Code. Copy-paste this when you start. |
| `.env.example` | Environment variables needed. |

## What this is

The tool answers four questions in one place: where are we vs. budget, what payments are due and from whom, what tasks are behind or upcoming, and what new emails from vendors need our attention.

It is built around three payers — Atharva's parents, Celesia's mom, and the couple themselves — and a single locked budget baseline that can be edited but tracks variance against the original.

## How to use this repo

1. Open this folder in VS Code.
2. Open `design-spec.html` in a browser — that's what you're building.
3. Open the terminal in VS Code, run `claude`.
4. Paste the contents of `INITIAL_PROMPT.md` as your first message.
5. Claude Code will read `CLAUDE.md` automatically and start scaffolding.

## Stack (locked decisions)

- Next.js 14+ (App Router) + TypeScript
- Vercel hosting + Vercel Postgres
- Prisma ORM
- Tailwind CSS + shadcn/ui
- Recharts for visualizations
- Gmail API for vendor email ingestion
- Google Sheets API for the auditable mirror
- Magic-link auth via Resend

---

## Phase 1 · Running the app

The Next.js scaffold, Prisma schema, seed script, dashboard, budget editor, vendor Kanban, task board, and settings are all wired up and seeded. Postgres 16.6 is installed locally (no Docker, no admin) at `%USERPROFILE%\.wedding-pg\`. The cluster lives in `data/`, the log in `postgres.log`, and the binaries in `bin/`.

### Daily workflow

```powershell
npm run db:up        # start Postgres
npm run dev          # Next dev server at http://localhost:3000
# ... when done ...
npm run db:down      # stop Postgres
```

If you ever need to rebuild from scratch:

```powershell
npm run db:up
npx prisma migrate dev
npm run seed
npm run dev
```

### Switching to a different database

The connection string lives in `.env` (used by Prisma CLI) and `.env.local` (used by Next at runtime). To point at Neon, Vercel Postgres, or a Docker-hosted Postgres instead, replace `DATABASE_URL` and `DIRECT_URL` in both files.

Open <http://localhost:3000>. The seed script reads `seed-data.xlsx` (High-level budget + Master checklist sheets); if the headers don't match it falls back to the hardcoded budget from CLAUDE.md and skips tasks.

### What's wired up

| Screen | Path | Notes |
|---|---|---|
| Dashboard | `/dashboard` | KPI strip, budget bars, upcoming payments, countdown, activity feed |
| Budget editor | `/budget` | Inline-editable planned amounts (commit on blur), payer chip per category |
| Category drilldown | `/budget/[id]` | Per-category committed/paid, payment list, mark-paid |
| Vendors | `/vendors` | 5-column Kanban + add-vendor dialog |
| Vendor detail | `/vendors/[id]` | Status changer, estimates list with add, contracts + payment payer chips |
| Tasks | `/tasks` | Behind / Now / Upcoming buckets + add-task dialog |
| Settings | `/settings` | Payer CRUD (name, color, optional cap) |
| Inbox | `/inbox` | Stub — wire up in Phase 3 |

Every mutation writes to `activity_log` with a human-readable `diff_summary`. The current user is hardcoded to `atharva.r.sinha@gmail.com` until Phase 5 auth ships.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run typecheck` | `tsc --noEmit` strict |
| `npm run seed` | Wipe + reseed payers, events, budget, tasks |
| `npm run db:up` / `db:down` / `db:status` | Start / stop / inspect local Postgres |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:studio` | Prisma Studio at :5555 |
