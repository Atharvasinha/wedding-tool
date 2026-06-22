import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/db/client";
import { aiSuggestForEmail } from "../lib/parsing/llm";

(async () => {
  const e = await prisma.email_items.findUniqueOrThrow({ where: { id: process.env.EMAIL_ID! } });
  console.log("Email:", e.subject);
  console.log("Has attachments:", Array.isArray(e.attachments_json) ? (e.attachments_json as unknown[]).length : 0);
  const t0 = Date.now();
  try {
    const r = await aiSuggestForEmail(e);
    console.log("Took", Date.now() - t0, "ms");
    console.log("Kind:", r.suggestion.kind);
    console.log("Reason:", r.suggestion.reason);
    if ("defaults" in r.suggestion) {
      console.log(
        "Defaults:",
        JSON.stringify(r.suggestion.defaults, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
      );
    }
    console.log("Usage:", r.usage);
  } catch (err) {
    console.error("ERROR:", err instanceof Error ? err.message : err);
  }
  await prisma.$disconnect();
})();
