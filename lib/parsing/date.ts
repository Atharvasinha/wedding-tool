// Extract dates from email text. Conservative: only matches common, unambiguous
// formats. Returns the FIRST plausible date.

import { decodeEntities } from "./intent";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];
const MONTH_RE = MONTHS.map((m) => m.slice(0, 3)).join("|") + "|" + MONTHS.join("|");

const PATTERNS: { re: RegExp; build: (m: RegExpMatchArray) => Date | null }[] = [
  // 2026-05-15 / 2026/05/15
  {
    re: /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/,
    build: (m) => mk(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  },
  // 5/15/2026 or 5/15/26
  {
    re: /\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/,
    build: (m) => {
      const yr = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
      return mk(yr, Number(m[1]) - 1, Number(m[2]));
    },
  },
  // May 15, 2026 / May 15 2026 / May 15th, 2026
  {
    re: new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,)?\\s+(20\\d{2})\\b`, "i"),
    build: (m) => {
      const monthIdx = monthIndex(m[1]);
      if (monthIdx == null) return null;
      return mk(Number(m[3]), monthIdx, Number(m[2]));
    },
  },
  // May 15 (no year) — assume current or next year (next if month already passed)
  {
    re: new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*20\\d{2})`, "i"),
    build: (m) => {
      const monthIdx = monthIndex(m[1]);
      if (monthIdx == null) return null;
      const day = Number(m[2]);
      const now = new Date();
      const yr = now.getMonth() > monthIdx || (now.getMonth() === monthIdx && now.getDate() > day)
        ? now.getFullYear() + 1
        : now.getFullYear();
      return mk(yr, monthIdx, day);
    },
  },
];

function mk(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1 || d > 31 || y < 2024 || y > 2030) return null;
  const dt = new Date(Date.UTC(y, m, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function monthIndex(name: string): number | null {
  const lower = name.toLowerCase();
  const full = MONTHS.indexOf(lower);
  if (full >= 0) return full;
  const abbr = MONTHS.findIndex((m) => m.startsWith(lower));
  return abbr >= 0 ? abbr : null;
}

export function extractDate(text: string | null): Date | null {
  if (!text) return null;
  const decoded = decodeEntities(text);
  for (const { re, build } of PATTERNS) {
    const m = decoded.match(re);
    if (m) {
      const d = build(m);
      if (d) return d;
    }
  }
  return null;
}

// Look for a date that's labeled as a due/by/before
export function extractDueDate(text: string | null): Date | null {
  if (!text) return null;
  const decoded = decodeEntities(text);
  // Try labeled forms first
  const labeled = decoded.match(
    new RegExp(`\\b(due|by|before|on or before|payable by)\\s+(?:on\\s+)?([^.,;\\n]{4,40})`, "i"),
  );
  if (labeled) {
    const d = extractDate(labeled[2]);
    if (d) return d;
  }
  // Fall back to first date in text
  return extractDate(decoded);
}
