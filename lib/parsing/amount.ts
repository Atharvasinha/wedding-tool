// Pulls the first plausible USD amount from email text and returns BigInt cents.
// Matches: $1,500 · $1,500.00 · USD 1500 · 1,500 dollars · $1.5k
// Skips trailing-fraction-only forms (e.g. ".00") and dates/IDs.

import { decodeEntities } from "./intent";

const PATTERNS = [
  // $1,234.56 / $1,234 / $1.5k / $1.5M
  /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s?([kKmM])?/g,
  // 1,234 dollars / 1234 dollars
  /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})\s*dollars?\b/gi,
  // USD 1234 / USD 1,234
  /\bUSD\s+([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/gi,
];

export type ExtractedAmount = { cents: bigint; raw: string };

export function extractAmount(text: string | null): ExtractedAmount | null {
  if (!text) return null;
  text = decodeEntities(text);
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[1].replace(/,/g, "");
      const suffix = match[2]?.toLowerCase();
      const num = Number(numStr);
      if (!Number.isFinite(num) || num <= 0) continue;
      let dollars = num;
      if (suffix === "k") dollars = num * 1_000;
      else if (suffix === "m") dollars = num * 1_000_000;
      // Filter implausible: under $10 or over $1M is almost certainly noise.
      if (dollars < 10 || dollars > 1_000_000) continue;
      return { cents: BigInt(Math.round(dollars * 100)), raw: match[0].trim() };
    }
  }
  return null;
}
