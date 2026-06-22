// Per-email AI triage using Claude Haiku 4.5. The system prompt and vendor
// list are prompt-cached so subsequent clicks reuse them at ~$0.10/MTok.
// First call writes the cache (~$0.001/email); subsequent calls within 5
// minutes hit the cache (~$0.0003/email).

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { email_items } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { fetchAttachmentBytes } from "@/lib/gmail/poll";
import type { Suggestion } from "./workflow";

const HAIKU = "claude-haiku-4-5";

const VENDOR_CATEGORIES = [
  "venue", "catering", "photography", "videography", "dj_band", "florist",
  "rentals", "hair_makeup", "attire", "transportation", "stationery",
  "officiant", "priest", "planner", "accommodation", "other",
] as const;

// ─── Output schema ───────────────────────────────────────
// The LLM returns plain JSON — strings, numbers, ISO dates. We convert
// to the wire-friendly Suggestion shape (also JSON-safe) at the boundary.

const LlmSuggestionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create_vendor"),
    reason: z.string(),
    name: z.string().min(1).max(120),
    category: z.enum(VENDOR_CATEGORIES),
    contact_email: z.string(),
  }),
  z.object({
    kind: z.literal("attach"),
    reason: z.string(),
    vendor_id: z.string().uuid(),
  }),
  z.object({
    kind: z.literal("create_estimate"),
    reason: z.string(),
    vendor_id: z.string().uuid(),
    amount_cents: z.number().int().positive(),
    package_name: z.string().max(120).nullable(),
  }),
  z.object({
    kind: z.literal("create_contract"),
    reason: z.string(),
    vendor_id: z.string().uuid(),
    amount_cents: z.number().int().min(0),
    signed_date: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("create_payment"),
    reason: z.string(),
    vendor_id: z.string().uuid(),
    amount_cents: z.number().int().positive(),
    due_date: z.string(),
    description: z.string().min(1).max(200),
    already_paid: z.boolean(),
    paid_date: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("mark_payment_paid"),
    reason: z.string(),
    payment_id: z.string().uuid(),
    paid_date: z.string(),
  }),
  z.object({
    kind: z.literal("review"),
    reason: z.string(),
  }),
]);

// ─── Prompts ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You triage email for a wedding planning tool used by Atharva & Celesia (wedding Dec 11 2027, Camp Lucy TX). The connected Gmail is celesia.atharva@gmail.com.

For each email, pick ONE action that should be taken. Output strictly matches the JSON schema; no prose.

VENDOR LIFECYCLE
researching → contacted → estimate_received → contracted → in_progress → delivered

ACTIONS

create_vendor — A new vendor not yet on the list. Pre-fill name + category from sender domain or forwarded header. Use this when the email indicates a real business relationship (estimate, contract, receipt, scheduling) AND no existing vendor matches.

attach — Email is from an existing vendor and just needs to be linked for the record. Use when intent is informational/scheduling and no new entity is needed.

create_estimate — Vendor sent a quote, proposal, or package pricing. amount_cents is the quoted total. Only fire when a clear $ figure is present.

create_contract — Vendor sent a contract to sign, or a "your contract is signed" confirmation. signed_date if it's already signed.

create_payment — Either an invoice (already_paid=false, future due_date) or a receipt (already_paid=true, paid_date matches the email). amount_cents required.

mark_payment_paid — A receipt for a payment that ALREADY EXISTS in our open-payments list. Only choose this if you find a matching payment_id below; otherwise use create_payment with already_paid=true.

review — Punt to human. Use when:
  - sender is a marketing list (NEST, ShopMy, Caraway shipping notifications, etc.)
  - sender is an intermediary platform (sertifi.net, docusign.net, hellosign, calendly) — the real vendor is hidden in the body and V1 can't reliably extract it
  - sender is one of the user's own addresses with no extractable forwarded message
  - intent is unclear or genuinely ambiguous

RULES
- vendor_id MUST be a real UUID from the CURRENT VENDORS list below. If the relevant vendor is NOT in that list, choose create_vendor instead (do not invent a UUID).
- payment_id MUST be a real UUID from the OPEN UNPAID PAYMENTS list. If no match, use create_payment with already_paid=true.
- Forwarded emails: the "From:" header inside the snippet is the real sender — use that, not celesiasmith23@gmail.com / atharva.r.sinha@gmail.com.
- Vendor name should be the COMPANY (e.g. "Whim Hospitality", "Camp Lucy"), not the contact person (not "Claire Klassen", not "Emily Parker"). Extract from domain if the From-name is a personal name.
- For create_estimate / create_payment / mark_payment_paid: amount_cents must be present and plausible ($100 to $200,000 for this wedding scale). Read PDF attachments if provided.
- reason: ≤200 chars, explain the call in plain English. The user reads this. Be concise — one sentence.

CATEGORIES (use one for create_vendor):
venue, catering, photography, videography, dj_band, florist, rentals, hair_makeup, attire, transportation, stationery, officiant, priest, planner, accommodation, other
`;

function vendorContext(
  vendors: { id: string; name: string; category: string; status: string; contact_email: string | null }[],
  openPayments: { id: string; vendor_id: string; vendor_name: string; description: string; amount_cents: number; due_date: string }[],
): string {
  const vLines = vendors.map(
    (v) => `${v.id} | ${v.name} | ${v.category} | ${v.status} | ${v.contact_email ?? ""}`,
  );
  const pLines = openPayments.map(
    (p) => `${p.id} | vendor=${p.vendor_name} | $${(p.amount_cents / 100).toFixed(0)} | due ${p.due_date} | "${p.description}"`,
  );
  return [
    "CURRENT VENDORS (id | name | category | status | contact_email):",
    vendors.length ? vLines.join("\n") : "(none)",
    "",
    "OPEN UNPAID PAYMENTS (id | vendor | amount | due_date | description):",
    openPayments.length ? pLines.join("\n") : "(none)",
  ].join("\n");
}

type Attachment = {
  filename: string;
  mime_type: string;
  size_bytes: number;
  gmail_message_id: string;
  gmail_attachment_id: string;
};

function emailPrompt(email: email_items, attachmentCount: number): string {
  const lines = [
    "Classify this email and return one action as JSON:",
    "",
    `From: ${email.from_address}${email.from_name ? ` (${email.from_name})` : ""}`,
    `Date: ${email.received_at.toISOString().slice(0, 10)}`,
    `Subject: ${email.subject ?? "(no subject)"}`,
    "",
    "Snippet:",
    email.body_snippet ?? "(no body)",
  ];
  if (attachmentCount > 0) {
    lines.push(
      "",
      `Note: ${attachmentCount} PDF attachment(s) included above. Read them — they likely contain the contract/estimate/invoice details.`,
    );
  }
  return lines.join("\n");
}

async function buildUserContent(email: email_items): Promise<Anthropic.ContentBlockParam[]> {
  const attachments = parseAttachments(email.attachments_json);
  const blocks: Anthropic.ContentBlockParam[] = [];

  // PDFs first so the model can reference them when reading the text
  for (const att of attachments) {
    if (att.mime_type !== "application/pdf") continue;
    const bytes = await fetchAttachmentBytes(att.gmail_message_id, att.gmail_attachment_id);
    if (!bytes) continue; // Gmail fetch failed, silently skip
    blocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") },
      title: att.filename,
    });
  }

  blocks.push({ type: "text", text: emailPrompt(email, blocks.length) });
  return blocks;
}

function parseAttachments(json: unknown): Attachment[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (a): a is Attachment =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as Attachment).filename === "string" &&
      typeof (a as Attachment).mime_type === "string" &&
      typeof (a as Attachment).gmail_message_id === "string" &&
      typeof (a as Attachment).gmail_attachment_id === "string",
  );
}

// ─── Public API ──────────────────────────────────────────

export type AiSuggestResult = {
  suggestion: Suggestion;
  usage: { input_tokens: number; cached_tokens: number; output_tokens: number };
};

export async function aiSuggestForEmail(email: email_items): Promise<AiSuggestResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in .env.local");
  }
  const client = new Anthropic();

  const [vendors, payments] = await Promise.all([
    prisma.vendors.findMany({
      where: { archived_at: null },
      select: { id: true, name: true, category: true, status: true, contact_email: true },
    }),
    prisma.payments.findMany({
      where: { paid_date: null },
      include: { contract: { include: { vendor: { select: { id: true, name: true } } } } },
    }),
  ]);

  const openPayments = payments
    .filter((p) => p.contract?.vendor)
    .map((p) => ({
      id: p.id,
      vendor_id: p.contract!.vendor.id,
      vendor_name: p.contract!.vendor.name,
      description: p.description,
      amount_cents: Number(p.amount),
      due_date: p.due_date.toISOString().slice(0, 10),
    }));

  // Build user message content blocks: any PDF attachments first, then the email body
  const userContent = await buildUserContent(email);

  const response = await client.messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: vendorContext(vendors, openPayments), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userContent }],
    output_config: { format: { type: "json_schema", schema: SUGGESTION_JSON_SCHEMA } },
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Haiku returned no text block");
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Haiku output wasn't valid JSON: " + textBlock.text.slice(0, 200));
  }

  const parseResult = LlmSuggestionSchema.safeParse(rawJson);
  if (!parseResult.success) {
    // Soft fallback: Haiku probably referenced a vendor/payment that doesn't
    // exist as a real UUID. Convert to a review suggestion the user can act on.
    const summary =
      typeof rawJson === "object" && rawJson !== null
        ? `Haiku wanted ${(rawJson as { kind?: string }).kind ?? "?"} but referenced unknown vendor/payment IDs. Pick a vendor manually.`
        : "Haiku returned an invalid suggestion shape.";
    return {
      suggestion: { kind: "review", reason: summary },
      usage: {
        input_tokens: response.usage.input_tokens,
        cached_tokens: response.usage.cache_read_input_tokens ?? 0,
        output_tokens: response.usage.output_tokens,
      },
    };
  }

  const usage = {
    input_tokens: response.usage.input_tokens,
    cached_tokens: response.usage.cache_read_input_tokens ?? 0,
    output_tokens: response.usage.output_tokens,
  };

  return {
    suggestion: convertToSuggestion(parseResult.data, vendors, payments),
    usage,
  };
}

// ─── JSON schema for the structured output ────────────────
// Matches LlmSuggestionSchema. Anthropic structured outputs use anyOf for
// discriminated unions; we mark every variant with additionalProperties:false.

const SUGGESTION_JSON_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "create_vendor" },
        reason: { type: "string" },
        name: { type: "string", minLength: 1, maxLength: 120 },
        category: { type: "string", enum: [...VENDOR_CATEGORIES] },
        contact_email: { type: "string" },
      },
      required: ["kind", "reason", "name", "category", "contact_email"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "attach" },
        reason: { type: "string" },
        vendor_id: { type: "string" },
      },
      required: ["kind", "reason", "vendor_id"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "create_estimate" },
        reason: { type: "string" },
        vendor_id: { type: "string" },
        amount_cents: { type: "integer" },
        package_name: { type: ["string", "null"] },
      },
      required: ["kind", "reason", "vendor_id", "amount_cents", "package_name"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "create_contract" },
        reason: { type: "string" },
        vendor_id: { type: "string" },
        amount_cents: { type: "integer" },
        signed_date: { type: ["string", "null"] },
      },
      required: ["kind", "reason", "vendor_id", "amount_cents", "signed_date"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "create_payment" },
        reason: { type: "string" },
        vendor_id: { type: "string" },
        amount_cents: { type: "integer" },
        due_date: { type: "string" },
        description: { type: "string", minLength: 1, maxLength: 200 },
        already_paid: { type: "boolean" },
        paid_date: { type: ["string", "null"] },
      },
      required: ["kind", "reason", "vendor_id", "amount_cents", "due_date", "description", "already_paid", "paid_date"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "mark_payment_paid" },
        reason: { type: "string" },
        payment_id: { type: "string" },
        paid_date: { type: "string" },
      },
      required: ["kind", "reason", "payment_id", "paid_date"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { type: "string", const: "review" },
        reason: { type: "string" },
      },
      required: ["kind", "reason"],
      additionalProperties: false,
    },
  ],
} as const;

// ─── Conversion: LLM JSON → wire-friendly Suggestion ─────

function convertToSuggestion(
  llm: z.infer<typeof LlmSuggestionSchema>,
  vendors: { id: string; name: string }[],
  payments: { id: string; description: string; amount: bigint; contract: { vendor_id: string } | null }[],
): Suggestion {
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "Unknown vendor";

  switch (llm.kind) {
    case "create_vendor":
      return {
        kind: "create_vendor",
        reason: llm.reason,
        defaults: {
          name: llm.name,
          category: llm.category,
          contactEmail: llm.contact_email,
        },
      };
    case "attach":
      return {
        kind: "attach",
        reason: llm.reason,
        defaults: { vendorId: llm.vendor_id, vendorName: vendorName(llm.vendor_id) },
      };
    case "create_estimate":
      return {
        kind: "create_estimate",
        reason: llm.reason,
        defaults: {
          vendorId: llm.vendor_id,
          vendorName: vendorName(llm.vendor_id),
          amountCents: BigInt(llm.amount_cents),
          packageName: llm.package_name ?? "",
        },
      };
    case "create_contract":
      return {
        kind: "create_contract",
        reason: llm.reason,
        defaults: {
          vendorId: llm.vendor_id,
          vendorName: vendorName(llm.vendor_id),
          amountCents: BigInt(llm.amount_cents),
          signedDate: llm.signed_date ? new Date(llm.signed_date) : null,
        },
      };
    case "create_payment": {
      // Find a contract for the vendor if any (first one wins)
      const contractId =
        payments.find((p) => p.contract?.vendor_id === llm.vendor_id)?.contract?.vendor_id == null
          ? null
          : payments.find((p) => p.contract?.vendor_id === llm.vendor_id)?.id ?? null;
      return {
        kind: "create_payment",
        reason: llm.reason,
        defaults: {
          vendorId: llm.vendor_id,
          vendorName: vendorName(llm.vendor_id),
          amountCents: BigInt(llm.amount_cents),
          dueDate: new Date(llm.due_date),
          description: llm.description,
          alreadyPaid: llm.already_paid,
          paidDate: llm.paid_date ? new Date(llm.paid_date) : null,
          contractId,
        },
      };
    }
    case "mark_payment_paid": {
      const p = payments.find((x) => x.id === llm.payment_id);
      if (!p || !p.contract) {
        return { kind: "review", reason: `LLM picked payment ${llm.payment_id} but it doesn't exist or isn't linked` };
      }
      return {
        kind: "mark_payment_paid",
        reason: llm.reason,
        defaults: {
          paymentId: llm.payment_id,
          paymentDescription: p.description,
          amountCents: p.amount,
          vendorName: vendorName(p.contract.vendor_id),
          paidDate: new Date(llm.paid_date),
        },
      };
    }
    case "review":
      return { kind: "review", reason: llm.reason };
  }
}
