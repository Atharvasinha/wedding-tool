import type { email_intent } from "@prisma/client";

// Ordered: earlier rules win when multiple fire. Specific before generic.
const RULES: { intent: email_intent; patterns: RegExp[] }[] = [
  {
    intent: "receipt",
    patterns: [
      /\breceipt\b/i,
      /\b(payment|deposit|installment|charge)s?\s+(received|confirmed|complete|processed|posted)/i,
      /\b(processed|received)\b.*\bthank/i,
      /\bthank(s| you)\b.*\b(payment|deposit|order|booking)/i,
      /\bthank(s| you)\s+for (your )?payment/i,
      /\bpaid in full\b/i,
      /\border (confirmation|shipped|placed)\b/i,
    ],
  },
  {
    intent: "invoice",
    patterns: [
      /\binvoice\b/i,
      /\bbalance\s+(due|owing|remaining)/i,
      /\b(amount|payment|installment)\s+due\b/i,
      /\bremittance\b/i,
      /\b(deposit|retainer)\b.*\b(requested|required|due)/i,
      /\bfinal payment\b/i,
    ],
  },
  {
    intent: "contract",
    patterns: [
      /\bcontract\b/i,
      /\bagreement\b/i,
      /\b(been\s+)?(signed|executed|countersigned)\b/i,
      /\bsignature\s+(needed|required|requested|complete)/i,
      /\bdocusign\b/i,
      /\bhellosign\b/i,
      /\bsertifi\b/i,
      /\b(please|kindly)\s+(sign|review)\b/i,
    ],
  },
  {
    intent: "estimate",
    patterns: [
      /\bestimate\b/i,
      /\bquote\b/i,
      /\bproposal\b/i,
      /\bpricing\b/i,
      /\b(package|service)\s+(options|details|info|information)/i,
      /\b(reaching out|interested in|connect with)\b/i,
    ],
  },
  {
    intent: "scheduling",
    patterns: [
      /\bappointment\b/i,
      /\bmeeting\b/i,
      /\bschedul(e|ed|ing)\b/i,
      /\b(consultation|walk[- ]?through|site visit|tasting)\b/i,
      /\bavailab(le|ility)\b.*\b(date|day|time)/i,
    ],
  },
  {
    intent: "informational",
    patterns: [
      /\b(security alert|sign[- ]?in|account)\b/i,
      /\b(newsletter|inspiration|featured?|just\s+for\s+you)\b/i,
      /\b(\d+%\s*off|ending soon|free shipping|new arrivals?)\b/i,
      /\b(unsubscribe|preferences)\b/i,
    ],
  },
];

export function inferIntent(
  subject: string | null,
  snippet: string | null,
  fromAddress?: string | null,
): email_intent {
  const text = decodeEntities(`${subject ?? ""}\n${snippet ?? ""}`);

  // Sender-based overrides — applied before content rules
  if (fromAddress) {
    // Known irrelevant platforms (ShopMy, Mailchimp, etc.) — always informational
    if (isIrrelevantSenderInline(fromAddress)) return "informational";

    // Marketing-list local-parts (mail@, noreply@, etc.) → informational
    // unless the subject mentions a clear transaction
    if (isMarketingSender(fromAddress)) {
      const looksTransactional = /\b(invoice|receipt|payment|contract|signed)\b/i.test(text);
      if (!looksTransactional) return "informational";
    }
  }

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return "unknown";
}

// Inlined to avoid circular import (vendor.ts already imports from intent.ts).
const IRRELEVANT_DOMAINS_INLINE = new Set([
  "shopmy.us", "mavely.com", "rewardstyle.com", "ltkit.com",
  "mailchimp.com", "constantcontact.com", "klaviyo.com", "hubspot.com",
  "stripe.com", "intuit.com", "quickbooks.com", "venmo.com", "zelle.com",
  "squarespace.com",
]);

function isIrrelevantSenderInline(addr: string): boolean {
  const domain = addr.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return IRRELEVANT_DOMAINS_INLINE.has(domain);
}

// Conservative — only obviously-bot prefixes. "hello@", "info@", "team@",
// "support@" are commonly used by small vendors as their main contact and
// should NOT be auto-suppressed.
const MARKETING_PREFIXES = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "mailer-daemon",
  "postmaster", "notifications", "notification", "alerts", "alert",
  "mail", "news", "newsletter", "marketing", "updates", "shipping",
  "status", "tracking",
]);

export function isMarketingSender(addr: string): boolean {
  const local = addr.split("@")[0]?.toLowerCase().replace(/[._-]/g, "-");
  if (!local) return false;
  return MARKETING_PREFIXES.has(local);
}

// Gmail snippets come HTML-encoded — decode the common entities so regex sees the real text.
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
