// One-off harness to validate Haiku output against real inbox data.
// Run: npx tsx -r dotenv/config scripts/test-ai.ts dotenv_config_path=.env.local

import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/db/client";
import { aiSuggestForEmail } from "../lib/parsing/llm";

async function main() {
  const emails = await prisma.email_items.findMany({
    where: { review_status: "pending_review" },
    orderBy: { received_at: "desc" },
  });

  let totalIn = 0;
  let totalCached = 0;
  let totalOut = 0;

  for (const email of emails) {
    process.stdout.write(`\n▸ ${email.subject?.slice(0, 70) ?? "(no subject)"}\n`);
    process.stdout.write(`  From: ${email.from_address}\n`);
    try {
      const { suggestion, usage } = await aiSuggestForEmail(email);
      totalIn += usage.input_tokens;
      totalCached += usage.cached_tokens;
      totalOut += usage.output_tokens;
      process.stdout.write(`  → ${suggestion.kind}\n`);
      process.stdout.write(`    reason: ${suggestion.reason}\n`);
      if ("defaults" in suggestion) {
        const d = suggestion.defaults as Record<string, unknown>;
        for (const [k, v] of Object.entries(d)) {
          if (v != null && v !== "") process.stdout.write(`    ${k}: ${v}\n`);
        }
      }
      process.stdout.write(`    tokens: ${usage.input_tokens} in (${usage.cached_tokens} cached) / ${usage.output_tokens} out\n`);
    } catch (e) {
      process.stdout.write(`  ✗ ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }

  // Rough cost estimate at Haiku 4.5 list pricing
  // $1/MTok input · $5/MTok output · cached reads $0.10/MTok · cached writes $1.25/MTok
  const uncachedIn = totalIn - totalCached;
  const cost = (uncachedIn * 1.0 + totalCached * 0.1 + totalOut * 5.0) / 1_000_000;
  process.stdout.write(
    `\nTotal: ${uncachedIn} uncached in + ${totalCached} cached + ${totalOut} out = ~$${cost.toFixed(4)}\n`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
