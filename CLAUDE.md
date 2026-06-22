# CLAUDE.md

This file orients Claude Code at the start of every session. Read it first. The full visual design spec is in `design-spec.html` — open it in a browser; it's the source of truth for layout, screens, color, and typography.

## What you're building

A wedding planning web app for Atharva & Celesia. Wedding date: **December 11, 2027** at Camp Lucy, Texas. ~125 guests, $142,682 locked budget, multi-event weekend (Sangeet · Vedic ceremony · Vedic lunch · Western ceremony · Reception · Sunday brunch).

The tool exists because no off-the-shelf product handles the four things this couple needs at once: (1) live budget against a locked baseline, (2) contract & payment tracking with three different payers (Atharva's parents, Celesia's mom, the couple themselves), (3) a master task list with dependencies, and (4) email ingestion from vendors. Section 1 of `design-spec.html` has the design principles; do not violate them.

## Locked technical decisions

| Decision | Choice |
|---|---|
| Hosting | Vercel |
| Framework | Next.js 14+ (App Router) + TypeScript |
| Styling | Tailwind CSS · custom design tokens matching `design-spec.html` |
| Database | **Vercel Postgres** (locked) |
| ORM | Prisma |
| Auth | Magic-link via Resend with an email allowlist (~30 lines, no passwords) |
| Email ingestion | Gmail API · OAuth2 read-only · polled every 5 min via Vercel Cron |
| Email parsing (V1) | Rules + regex only · no LLM calls |
| Spreadsheet mirror | Google Sheets API · synced every 5 min via Vercel Cron · one tab per table · read-only for viewers |
| Charting | Recharts |
| Component library | shadcn/ui where it doesn't fight the custom design |
| Connected Gmail | `celesia.atharva@gmail.com` |
| Target | Desktop-first · works on mobile but not optimized |

## Project structure (target)

```
/app                  Next.js App Router pages
  /dashboard          Screen 1 — the hero
  /budget             Screen 2 — drill-down and editor
  /vendors            Screen 4 — pipeline + comparison
  /tasks              Screen 5 — three-column board
  /inbox              Screen 6 — email review queue
  /api                Server routes (REST)
/components           Reusable UI (BudgetBar, PayerChip, etc.)
/lib
  /db                 Prisma client + queries
  /gmail              Gmail polling & parsing
  /sheets             Google Sheets sync
  /parsing            Email rules + regex
/prisma
  schema.prisma       From schema.sql in this folder
/scripts
  seed-from-excel.ts  One-time import from seed-data.xlsx
/cron                 Vercel Cron handlers
```

## The three payers (this is important)

Every payment belongs to one of these. Pre-seed them as the only payers. Atharva will add more if needed via the Settings UI.

| Payer | Color (CSS var) | Default categories |
|---|---|---|
| `Atharva's parents` | `--gold` `#C9913A` | Venue Fees, Guest Travel & Rooms, Misc Rentals, Planner |
| `Celesia's mom` | `--terracotta` `#B8451E` | Food & Beverage |
| `Atharva & Celesia (us)` | `--teal` `#3A6256` | Attire, Photography, Invites & Favors |

These are *defaults* for new payments under each category. Specific payments can override. Show payer everywhere there's a dollar amount — in lists, on cards, in tables, in chart legends.

## The locked budget

| Category | Amount | Default payer |
|---|---:|---|
| Food & Beverage | $64,625 | Celesia's mom |
| Venue Fees | $28,435 | Atharva's parents |
| Guest Travel & Rooms | $23,816 | Atharva's parents |
| Misc Rentals | $11,500 | Atharva's parents |
| Attire | $10,000 | Us |
| Photography | $6,200 | Us |
| Planner / Coordination | $2,000 | Atharva's parents |
| Invites & Favors | $1,500 | Us |
| **Working total** | **$148,076** | — |
| Locked baseline | $142,682 | — |

The budget is locked at **$142,682** (the No Brunch / Mid Dec scenario from `seed-data.xlsx`). The numbers above are the current working state with a couple of edits pending — store them as the seed values. Tolerance is ±5% before warning the user.

## Build order

Follow this. Do not skip ahead.

**Phase 1 · Manual everything (3-5 days):** all six tables in Postgres, full CRUD via UI, no email, no sheets sync. Dashboard with the budget bars rendering against seed data. Budget editor that actually edits. Vendors kanban with manual cards. Tasks board seeded from the Excel checklist. The app should be fully usable as a "better spreadsheet" at end of Phase 1.

**Phase 2 · Visual polish (2-3 days):** Drill-down screens, comparison view for vendor estimates, dependency hints on tasks, activity feed, mobile-responsive checks.

**Phase 3 · Email ingestion (3-5 days):** Gmail OAuth, Vercel Cron polling, rules + regex parsing for amount/vendor/intent, suggestion-and-confirm flow in the Inbox tab.

**Phase 4 · Google Sheets mirror (1-2 days):** One tab per Postgres table, full overwrite on each sync, 5-min cron. Read-only on the Sheet.

**Phase 5 · Auth & notifications (1-2 days):** Magic-link with email allowlist, payment-due reminders.

Stretch (after Phase 5): LLM-assisted parsing, scenario comparison, "what if guest count changes" calculator.

## Design rules

The visual design spec is detailed. Match it. Specifically:

- **Editorial, not SaaS dashboard.** Warm cream background (`#F8F2E6`), deep ink (`#1A1614`), terracotta accent (`#B8451E`).
- **Fonts:** Fraunces for display (variable, use it expressively with italic for emphasis), DM Sans for UI, JetBrains Mono for numbers and codes. All numbers use `font-variant-numeric: tabular-nums`.
- **No emojis. No generic chart libraries' default styling.** Recharts is fine but theme it.
- **Avoid bold colors except for status and payers.** Most of the UI is cream, ink, and muted tones. Color is used to *mean* something, not to decorate.
- **Tables before headers.** Information density is moderate-to-high. The user wants to scan, not read.
- **Numbers > prose.** Show the dollar figure prominently, the explanatory text small.
- **Click-into-everything.** Budget rows, vendor cards, payment lines, task cards — they all open a drill-down or detail panel.
- **No save buttons.** Edits commit on blur. Optimistic UI.
- **Payer chips are always interactive.** Every payer chip in the app (Budget Editor table, Drill-down payments, Dashboard upcoming list, Vendor cards, anywhere a payer is shown) is a button that opens a small popover with the three payers listed and a check mark next to the current one. Clicking a different payer changes the assignment immediately and writes to `activity_log`. The popover also has a "+ Add new payer" option for the rare case Atharva wants to add a fourth.

## Payer assignment levels

There are three levels at which a payer can be assigned. Be precise about which one is being edited.

1. **Category default** (`budget_categories.default_payer_id`) — the default for any new payment created under this category. Edited via the Budget Editor table.
2. **Payment override** (`payments.payer_id`) — the actual payer for one specific payment. Edited via the Drill-down or the Contracts & Payments views. Inherits from category default on create, can be changed.
3. **Contract-wide override** (not stored separately — it's just the pattern of all the contract's payments having the same payer) — when adding a contract, the UI offers "All payments by [category default payer]" as the one-click option, or "Customize per payment" for splits.

Every payer change writes an `activity_log` row with the before/after for auditability.

## Conventions

- TypeScript strict mode. No `any`.
- Server components by default. Client components only when interactivity demands it.
- Server actions for mutations from forms; API routes for everything else.
- Prisma queries in `lib/db/`, one file per table. Never query from inside a component.
- Money stored as integer cents in the database, formatted at the boundary.
- Dates stored as `timestamp with time zone` in UTC. Format in the UI with the user's local timezone.
- All amounts displayed with thousands separators, no decimals unless a fraction of a dollar exists in the source.
- Activity log: every mutation writes a row to `activity_log` with user_id, entity_type, entity_id, action, diff, timestamp.
- Soft delete only. Never hard-delete records.

## What NOT to build

These were considered and explicitly cut. Don't re-add without asking.

- Free stuff / sponsorship tracker
- Guest list management (the existing spreadsheet handles this; not in this tool)
- Seating chart UI
- Mobile-first or PWA features
- SMS/push notifications (email digest is enough)
- Real-time WebSockets (5-minute polling is fine for this user base)
- Multi-currency
- Bank or credit card integration
- LLM-assisted email parsing in V1

## Open items to surface, not invent

When you hit one of these, stop and ask Atharva. Don't guess.

- The exact email allowlist for magic-link auth.
- Whether parents get read-only access to the app, or only to the Google Sheet mirror.
- Whether the Sheet mirror should include `email_items` (raw email content might feel weird in a shared sheet).
