import { prisma } from "@/lib/db/client";
import { decodeEntities } from "./intent";

type VendorMatch = {
  vendor_id: string;
  vendor_name: string;
  reason: "email_match" | "domain_match" | "name_match" | "forwarded_email" | "forwarded_name";
};

// User-owned accounts that should never be treated as vendor senders.
// Emails From: these are almost always self-forwards.
const USER_ACCOUNTS = new Set(
  [
    process.env.GMAIL_ACCOUNT?.toLowerCase(),
    "celesia.atharva@gmail.com",
    "celesiasmith23@gmail.com",
    "atharva.r.sinha@gmail.com",
  ].filter(Boolean) as string[],
);

export function isUserAccount(addr: string): boolean {
  return USER_ACCOUNTS.has(addr.toLowerCase().trim());
}

// Intermediary platforms that forward real vendor info inside the email body.
// When these are the "From" line, the actual vendor is elsewhere — punt
// vendor matching/creation to manual review.
const INTERMEDIARY_DOMAINS = new Set([
  "sertifi.net", "docusign.net", "docusign.com", "hellosign.com",
  "adobesign.com", "echosign.com", "pandadoc.com", "signnow.com",
  "calendly.com", "acuityscheduling.com",
  "honeybook.com", "dubsado.com", "17hats.com",
]);

// Platforms that are never wedding vendors — affiliate/creator/marketing tools,
// payment processor notifications, etc. Always classify as informational.
const IRRELEVANT_DOMAINS = new Set([
  // Creator-marketing / influencer platforms
  "shopmy.us", "mavely.com", "rewardstyle.com", "ltkit.com",
  // Generic marketing/CRM tools sending TO the user
  "mailchimp.com", "constantcontact.com", "klaviyo.com", "hubspot.com",
  // Payment platform notifications (real receipts come from vendors)
  "stripe.com", "intuit.com", "quickbooks.com", "venmo.com", "zelle.com",
  // Squarespace platform notifications
  "squarespace.com",
]);

export function isBotSender(addr: string): boolean {
  const domain = addr.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return INTERMEDIARY_DOMAINS.has(domain);
}

export function isIrrelevantSender(addr: string): boolean {
  const domain = addr.split("@")[1]?.toLowerCase().trim();
  if (!domain) return false;
  return IRRELEVANT_DOMAINS.has(domain);
}

// Extract the original sender from a forwarded message body. Gmail forwards
// embed a header like:
//   ---------- Forwarded message ---------
//   From: SomeName <someone@example.com>
//   Date: ...
//   Subject: ...
// Returns the name and address of the original sender, or null.
export function extractForwardedSender(snippet: string | null): { name: string | null; address: string } | null {
  if (!snippet) return null;
  const text = decodeEntities(snippet);
  // Look for "From: Name <email>" or "From: email"
  const m = text.match(/From:\s*(?:"?([^"<\n]*?)"?\s*)?<\s*([^@\s>]+@[^>\s]+)\s*>/i);
  if (m) {
    const name = m[1]?.trim() || null;
    return { name, address: m[2].trim().toLowerCase() };
  }
  const bare = text.match(/From:\s*([^\s,;\n]+@[^\s,;\n]+)/i);
  if (bare) {
    return { name: null, address: bare[1].trim().toLowerCase() };
  }
  return null;
}

export async function guessVendor(
  fromAddress: string,
  fromName: string | null,
  bodySnippet: string | null = null,
): Promise<VendorMatch | null> {
  const vendors = await prisma.vendors.findMany({
    where: { archived_at: null },
    select: { id: true, name: true, contact_email: true },
  });
  if (vendors.length === 0) return null;

  const addr = fromAddress.toLowerCase().trim();
  const domain = addr.split("@")[1] ?? "";
  const namePart = (fromName ?? "").toLowerCase().trim();

  // 1. Exact email match on the From header
  for (const v of vendors) {
    if (v.contact_email && v.contact_email.toLowerCase() === addr) {
      return { vendor_id: v.id, vendor_name: v.name, reason: "email_match" };
    }
  }

  // 2. Domain match on the From header
  if (domain) {
    for (const v of vendors) {
      if (v.contact_email && v.contact_email.toLowerCase().endsWith(`@${domain}`)) {
        return { vendor_id: v.id, vendor_name: v.name, reason: "domain_match" };
      }
    }
  }

  // 3. Forwarded email — scan snippet for "From: ... <vendor@domain>" lines.
  // Common when Celesia forwards a vendor email to the inbox.
  const snippet = bodySnippet ? decodeEntities(bodySnippet) : "";
  if (snippet) {
    const fwdEmails = Array.from(snippet.matchAll(/<\s*([^@\s>]+@[^>\s]+?)\s*>/g)).map((m) =>
      m[1].toLowerCase(),
    );
    for (const v of vendors) {
      const vEmail = v.contact_email?.toLowerCase();
      if (!vEmail) continue;
      if (fwdEmails.includes(vEmail)) {
        return { vendor_id: v.id, vendor_name: v.name, reason: "forwarded_email" };
      }
      const vDomain = vEmail.split("@")[1];
      if (vDomain && fwdEmails.some((e) => e.endsWith(`@${vDomain}`))) {
        return { vendor_id: v.id, vendor_name: v.name, reason: "forwarded_email" };
      }
    }
  }

  // 4. Substring match: vendor name appears in from-name, sender domain, or snippet
  const haystacks = [namePart, domain.replace(/\..+$/, ""), snippet.toLowerCase()].filter(Boolean);
  for (const v of vendors) {
    const needle = v.name.toLowerCase().replace(/[^\w\s]/g, "");
    if (needle.length < 4) continue;
    const inFromOrDomain = haystacks.slice(0, 2).some((h) => h.includes(needle));
    const inSnippet = haystacks[2]?.includes(needle) ?? false;
    if (inFromOrDomain) {
      return { vendor_id: v.id, vendor_name: v.name, reason: "name_match" };
    }
    if (inSnippet) {
      return { vendor_id: v.id, vendor_name: v.name, reason: "forwarded_name" };
    }
  }

  return null;
}
