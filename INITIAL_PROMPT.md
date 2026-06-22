# Initial Prompt

Copy everything below the divider and paste it as your first message to Claude Code.

---

I'm building a wedding planning web app. You have these files to work from:

- `CLAUDE.md` — working rules, locked technical decisions, the three payers, the locked budget, the build order. **Read this first and follow it.**
- `design-spec.html` — visual design spec with 5 fully-rendered screen mockups (Dashboard, Budget Editor, Vendors, Tasks, Inbox). Open it and look at it carefully. Match the layout, color palette, typography, and component patterns. This is the source of truth for the UI.
- `seed-data.xlsx` — the original wedding planning spreadsheet. Has the locked budget (use the "High-level budget" sheet, "No Brunch / Mid Dec" column), the master task checklist (152 tasks across 16 timeframe buckets), and cost benchmarks.
- `schema.sql` — initial Postgres schema for all 6 core tables plus payers, events, budget categories, activity log, and lightweight auth tables.
- `.env.example` — every environment variable needed.

**Start with Phase 1 from CLAUDE.md: manual everything.** That means:

1. Scaffold a Next.js 14 App Router project with TypeScript and Tailwind. Pin versions.
2. Translate `schema.sql` into `prisma/schema.prisma`. Set up Prisma client. Generate migrations.
3. Write a seed script (`scripts/seed.ts`) that pre-loads:
   - The 3 payers from CLAUDE.md (Atharva's parents, Celesia's mom, Us)
   - The 6 events
   - The 8 budget categories with their baseline and planned amounts (read from `seed-data.xlsx`)
   - The ~152 tasks from the Master checklist sheet
4. Build the design tokens in Tailwind config — pull the exact color values, fonts, and spacing from the CSS variables in `design-spec.html`. Match them exactly.
5. Build the navigation shell (left rail + top bar with countdown) so all screens share it.
6. Build the **Dashboard** first (Section 03 of the design spec). Get the budget bars rendering against the seeded data. Get the "Next 14 days" and "Behind & at risk" panels working with the seeded tasks. KPI strip at the top.
7. Build the **Budget Editor** (Section 05). The stacked bar at top, the editable table below, the live by-payer summary. Edits commit on blur to Postgres. No save button.
8. Build the **Vendors** kanban (Section 06) with full CRUD via the UI.
9. Build **Tasks** (Section 07) — three-column board, list view, calendar view.
10. Leave **Inbox** (Section 08) as an empty stub for now — Phase 3.

Before you write any code:
- Confirm the stack decisions match what's in `CLAUDE.md`.
- Flag anything in the design spec that seems impractical at the spec's level of detail.
- Tell me what you'd do differently and why, if anything. I want pushback where it's deserved.

Then start with step 1. Show me a plan with rough time estimates per step before coding, so I can correct anything you've misread.

Two operating principles for our work together:

1. **The design is locked.** Don't redesign the screens. Match `design-spec.html`. Pixel-fidelity isn't required but the *feel* — warm cream surface, editorial typography, restrained color, click-into-everything — must come through.

2. **The data model is locked.** Don't add tables or fields beyond what's in `schema.sql`. If you think something's missing, ask before adding.

Let's go.
