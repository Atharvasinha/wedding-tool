// Workflow suggester: takes an email (with parsed intent/amount/vendor guess)
// and returns the recommended next action. Powers the "Suggested:" banner on
// each inbox card.
//
// The lifecycle this models:
//   no vendor → CREATE_VENDOR → ATTACH
//   vendor + estimate intent → CREATE_ESTIMATE (advances status to estimate_received)
//   vendor + contract intent → CREATE_CONTRACT (advances status to contracted)
//   vendor + invoice intent → CREATE_PAYMENT (with due_date, unpaid)
//   vendor + receipt intent + matching open payment → MARK_PAYMENT_PAID
//   vendor + receipt intent + no match → CREATE_PAYMENT (already paid)
//   anything else → ATTACH

import type { email_items, vendors, payments, estimates, contracts } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { extractDate, extractDueDate } from "./date";
import { decodeEntities } from "./intent";
import { extractForwardedSender, isBotSender, isUserAccount } from "./vendor";

export type Suggestion =
  | {
      kind: "create_vendor";
      reason: string;
      defaults: { name: string; category: string; contactEmail: string };
    }
  | {
      kind: "create_estimate";
      reason: string;
      defaults: { vendorId: string; vendorName: string; amountCents: bigint; packageName: string };
    }
  | {
      kind: "create_contract";
      reason: string;
      defaults: { vendorId: string; vendorName: string; amountCents: bigint; signedDate: Date | null };
    }
  | {
      kind: "create_payment";
      reason: string;
      defaults: {
        vendorId: string;
        vendorName: string;
        amountCents: bigint;
        dueDate: Date;
        description: string;
        alreadyPaid: boolean;
        paidDate: Date | null;
        contractId: string | null;
      };
    }
  | {
      kind: "mark_payment_paid";
      reason: string;
      defaults: {
        paymentId: string;
        paymentDescription: string;
        amountCents: bigint;
        vendorName: string;
        paidDate: Date;
      };
    }
  | {
      kind: "attach";
      reason: string;
      defaults: { vendorId: string; vendorName: string };
    }
  | {
      kind: "review";
      reason: string;
    };

type EmailWithVendor = email_items & {
  suggested_vendor:
    | (Pick<vendors, "id" | "name" | "category" | "status"> & {
        estimates: Pick<estimates, "id" | "total_amount" | "received_date">[];
        contracts: (Pick<contracts, "id" | "total_contract_amount" | "status"> & {
          payments: Pick<payments, "id" | "description" | "amount" | "due_date" | "paid_date">[];
        })[];
      })
    | null;
};

export async function suggestForEmail(email: email_items): Promise<Suggestion> {
  // No vendor link → either create one (if email looks like real vendor signal)
  // or just punt to manual review.
  if (!email.suggested_vendor_id) {
    const intentIsTransactional =
      email.parsed_intent === "estimate" ||
      email.parsed_intent === "invoice" ||
      email.parsed_intent === "receipt" ||
      email.parsed_intent === "contract" ||
      email.parsed_intent === "scheduling";

    // For "unknown" intent, treat custom-domain senders (not gmail/yahoo/etc.,
    // not a known bot) as a soft estimate signal — these are usually first
    // outreach from a vendor that didn't trigger any explicit keyword.
    const isCustomDomainSender =
      email.parsed_intent === "unknown" &&
      !isUserAccount(email.from_address) &&
      !isBotSender(email.from_address) &&
      !isPersonalEmail(email.from_address);

    if (!intentIsTransactional && !isCustomDomainSender) {
      return { kind: "review", reason: "Unclear intent and no vendor match — review manually" };
    }

    // For self-forwards, use the embedded "From: ..." line as the real sender.
    let effectiveName = email.from_name?.trim() ?? "";
    let effectiveAddr = email.from_address;
    if (isUserAccount(email.from_address)) {
      const fwd = extractForwardedSender(email.body_snippet);
      if (fwd) {
        effectiveName = fwd.name?.trim() ?? "";
        effectiveAddr = fwd.address;
      } else {
        return {
          kind: "review",
          reason: "Forwarded email — open Gmail to identify the original sender",
        };
      }
    }

    // E-signature platforms / payment processors are intermediaries — the real
    // vendor info lives elsewhere in the email body, which V1 regex can't
    // reliably extract. Punt to manual review.
    if (isBotSender(effectiveAddr)) {
      return {
        kind: "review",
        reason: `Sent via ${effectiveAddr.split("@")[1]} — open the email to find the real vendor`,
      };
    }

    const defaultName = bestVendorName(effectiveName, effectiveAddr);
    if (!defaultName || isUserAccount(effectiveAddr)) {
      return { kind: "review", reason: "Couldn't extract a clean sender — review manually" };
    }
    return {
      kind: "create_vendor",
      reason: `New sender · ${email.parsed_intent} email — create the vendor first, then attach`,
      defaults: {
        name: defaultName,
        category: guessCategory(effectiveAddr, email.subject, email.body_snippet),
        contactEmail: effectiveAddr,
      },
    };
  }

  const vendor = await prisma.vendors.findUnique({
    where: { id: email.suggested_vendor_id },
    include: {
      estimates: { select: { id: true, total_amount: true, received_date: true } },
      contracts: {
        include: {
          payments: { select: { id: true, description: true, amount: true, due_date: true, paid_date: true } },
        },
      },
    },
  });
  if (!vendor) {
    return { kind: "review", reason: "Linked vendor no longer exists" };
  }

  const amount = email.parsed_amount;
  const text = decodeEntities(`${email.subject ?? ""}\n${email.body_snippet ?? ""}`);

  // Receipt — try to match an existing open payment by amount
  if (email.parsed_intent === "receipt") {
    const openPayments = vendor.contracts
      .flatMap((c) => c.payments)
      .filter((p) => !p.paid_date);

    if (amount && openPayments.length > 0) {
      // Match within ±$5 of amount (round-trip cents tolerance)
      const tolerance = 500n;
      const closest = openPayments
        .map((p) => ({ p, delta: p.amount > amount ? p.amount - amount : amount - p.amount }))
        .filter(({ delta }) => delta <= tolerance)
        .sort((a, b) => Number(a.delta - b.delta))[0];
      if (closest) {
        return {
          kind: "mark_payment_paid",
          reason: `Receipt for ${fmt(amount)} matches open payment "${closest.p.description}"`,
          defaults: {
            paymentId: closest.p.id,
            paymentDescription: closest.p.description,
            amountCents: closest.p.amount,
            vendorName: vendor.name,
            paidDate: extractDate(text) ?? email.received_at,
          },
        };
      }
    }
    // Receipt with no matching open payment → create payment already-paid
    if (amount) {
      const contractId = vendor.contracts[0]?.id ?? null;
      return {
        kind: "create_payment",
        reason: `Receipt detected — record as already-paid payment`,
        defaults: {
          vendorId: vendor.id,
          vendorName: vendor.name,
          amountCents: amount,
          dueDate: email.received_at,
          description: payDescription(email),
          alreadyPaid: true,
          paidDate: extractDate(text) ?? email.received_at,
          contractId,
        },
      };
    }
    // Receipt without a clear amount — just attach
    return {
      kind: "attach",
      reason: `Receipt from ${vendor.name} (no amount detected)`,
      defaults: { vendorId: vendor.id, vendorName: vendor.name },
    };
  }

  // Invoice — create a payment with due_date
  if (email.parsed_intent === "invoice" && amount) {
    const due = extractDueDate(text) ?? defaultDueDate(email.received_at);
    const contractId = vendor.contracts[0]?.id ?? null;
    return {
      kind: "create_payment",
      reason: `Invoice for ${fmt(amount)} — schedule payment due ${fmtDate(due)}`,
      defaults: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        amountCents: amount,
        dueDate: due,
        description: payDescription(email),
        alreadyPaid: false,
        paidDate: null,
        contractId,
      },
    };
  }

  // Estimate — create estimate (skip if one with same amount already exists)
  if (email.parsed_intent === "estimate" && amount) {
    const dup = vendor.estimates.find(
      (e) => e.total_amount === amount,
    );
    if (dup) {
      return {
        kind: "attach",
        reason: `Estimate for ${fmt(amount)} already on file — just attach for record`,
        defaults: { vendorId: vendor.id, vendorName: vendor.name },
      };
    }
    return {
      kind: "create_estimate",
      reason: `Quote for ${fmt(amount)} from ${vendor.name}`,
      defaults: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        amountCents: amount,
        packageName: trimSubject(email.subject),
      },
    };
  }

  // Contract — create contract record (use amount if present, else 0 placeholder)
  if (email.parsed_intent === "contract") {
    const signedDate = extractDate(text);
    return {
      kind: "create_contract",
      reason: amount
        ? `Contract signed for ${fmt(amount)}`
        : `Contract activity — create contract record`,
      defaults: {
        vendorId: vendor.id,
        vendorName: vendor.name,
        amountCents: amount ?? vendor.estimates[0]?.total_amount ?? 0n,
        signedDate,
      },
    };
  }

  // Default: attach for record
  return {
    kind: "attach",
    reason: `${email.parsed_intent === "scheduling" ? "Scheduling note" : "Update"} from ${vendor.name}`,
    defaults: { vendorId: vendor.id, vendorName: vendor.name },
  };
}

export async function suggestBatch(emails: email_items[]): Promise<Map<string, Suggestion>> {
  const result = new Map<string, Suggestion>();
  // Serial for now — N is small (<50). If this grows, batch the vendor fetches.
  for (const e of emails) {
    result.set(e.id, await suggestForEmail(e));
  }
  return result;
}

// ─── helpers ────────────────────────────────────────────

// Common personal-email providers — sender being one of these means we can't
// derive a vendor name from the domain.
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
  "aol.com", "live.com", "me.com", "msn.com", "protonmail.com",
]);

function isPersonalEmail(addr: string): boolean {
  const domain = addr.split("@")[1]?.toLowerCase().trim();
  if (!domain) return true;
  return PERSONAL_DOMAINS.has(domain);
}

function deriveName(addr: string): string {
  const domain = addr.split("@")[1] ?? addr;
  const root = domain.split(".")[0] ?? "";
  if (!root) return "";
  return splitDomainRoot(root);
}

// Heuristic split for domain roots: "campLucy" → "Camp Lucy",
// "whimhospitality" → "Whim Hospitality" (best-effort word-boundary detection).
function splitDomainRoot(root: string): string {
  // CamelCase split
  const camel = root.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (camel !== root) return capitalize(camel);
  // Common multi-word patterns (lowercase)
  const wordlist = ["hospitality", "events", "studio", "studios", "weddings", "wedding",
                    "catering", "photography", "design", "florals", "florist", "rentals",
                    "lucy", "lighting", "production"];
  let result = root.toLowerCase();
  for (const w of wordlist) {
    const i = result.indexOf(w);
    if (i > 0) {
      result = result.slice(0, i) + " " + result.slice(i);
      break; // one split is enough
    }
  }
  return result.split(" ").map(capitalize).join(" ");
}

function capitalize(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Prefer the From-name if it looks like a company, else derive from domain.
// Personal-name pattern: 1-3 capitalized words, no &/Co/LLC/Inc/etc.
function bestVendorName(name: string, addr: string): string {
  const trimmed = name.trim();
  const fromDomain = deriveName(addr);
  if (!trimmed) return fromDomain;

  const companyMarkers = /&|\b(co\.?|llc|inc|ltd|studios?|hospitality|events?|group|catering|photo|photography|design|florist|florals|productions?|rentals|lighting)\b/i;
  if (companyMarkers.test(trimmed)) return trimmed;
  // Looks like a personal name? (e.g. "Claire Klassen") → fall back to domain
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}$/.test(trimmed)) return fromDomain;
  // Default to the From-name (could be anything)
  return trimmed;
}

// Guess vendor_category from sender domain + subject keywords.
function guessCategory(addr: string, subject: string | null, snippet: string | null): string {
  const text = `${addr} ${subject ?? ""} ${snippet ?? ""}`.toLowerCase();
  const rules: [RegExp, string][] = [
    [/\b(camp lucy|venue|chapel|hall|ballroom|estate)\b/, "venue"],
    [/\b(cater|catering|food|chef|menu|cuisine)\b/, "catering"],
    [/\b(photo|photograph)\b/, "photography"],
    [/\b(video|cinematograph|film)\b/, "videography"],
    [/\b(dj|band|music|sound|dhol)\b/, "dj_band"],
    [/\b(floral|florist|flower|bloom)\b/, "florist"],
    [/\b(rental|tent|chair|table|linen)\b/, "rentals"],
    [/\b(hair|makeup|mua|stylist)\b/, "hair_makeup"],
    [/\b(dress|suit|tuxedo|attire|bridal|gown)\b/, "attire"],
    [/\b(shuttle|transport|car|limo)\b/, "transportation"],
    [/\b(invite|stationery|paper|card)\b/, "stationery"],
    [/\b(officiant|priest|pandit|pastor|rabbi)\b/, "officiant"],
    [/\b(planner|coordination|coordinator|stedman)\b/, "planner"],
    [/\b(hotel|inn|accommodation|lodging|room block|whim hospitality)\b/, "accommodation"],
  ];
  for (const [pattern, cat] of rules) {
    if (pattern.test(text)) return cat;
  }
  return "other";
}

function fmt(cents: bigint): string {
  return `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function payDescription(email: email_items): string {
  // Use subject if present, else a generic description
  const s = trimSubject(email.subject);
  if (s) return s;
  return `Payment to ${email.from_name ?? email.from_address}`;
}

function trimSubject(s: string | null | undefined): string {
  if (!s) return "";
  // Strip common reply/forward prefixes
  return s.replace(/^\s*(Re:|Fwd:|FW:|RE:)\s*/gi, "").trim().slice(0, 100);
}

function defaultDueDate(received: Date): Date {
  // If no due date is parsed, assume 30 days out
  const d = new Date(received);
  d.setDate(d.getDate() + 30);
  return d;
}
