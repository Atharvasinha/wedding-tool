import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { gmail_v1 } from "googleapis";
import { prisma } from "@/lib/db/client";
import { getGmailClientFromRefreshToken } from "@/lib/gmail/client";
import { inferIntent } from "@/lib/parsing/intent";
import { extractAmount } from "@/lib/parsing/amount";
import { guessVendor } from "@/lib/parsing/vendor";
import { logActivity } from "@/lib/activity";

// Inbox: Primary tab only. Sent: everything (no category filter — Gmail puts
// outgoing mail in its own SENT label, not the inbox tabs).
const INBOX_QUERY = "newer_than:14d category:primary -in:chats -in:drafts";
const SENT_QUERY = "in:sent newer_than:14d -in:chats -in:drafts";
const PAGE_SIZE = 50;

// Local attachment store — outside node_modules + .next so it persists across
// rebuilds. PDFs only, capped at 10MB each. Path is also OS-portable.
const ATTACHMENT_ROOT = path.join(os.homedir(), ".wedding-pg", "attachments");
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type PollResult = {
  fetched: number;
  inserted: number;
  attachments_saved: number;
  errors: string[];
};

export async function pollAll(): Promise<{ inbox: PollResult; sent: PollResult }> {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("GMAIL_REFRESH_TOKEN not set. Visit /api/auth/gmail/start once to complete OAuth.");
  }
  const gmail = getGmailClientFromRefreshToken(refreshToken);
  const inbox = await pollOne(gmail, INBOX_QUERY, "incoming");
  const sent = await pollOne(gmail, SENT_QUERY, "outgoing");
  return { inbox, sent };
}

// Back-compat shim so existing callers keep working
export async function pollGmail(): Promise<PollResult> {
  const { inbox, sent } = await pollAll();
  return {
    fetched: inbox.fetched + sent.fetched,
    inserted: inbox.inserted + sent.inserted,
    attachments_saved: inbox.attachments_saved + sent.attachments_saved,
    errors: [...inbox.errors, ...sent.errors],
  };
}

async function pollOne(
  gmail: gmail_v1.Gmail,
  query: string,
  direction: "incoming" | "outgoing",
): Promise<PollResult> {
  const result: PollResult = { fetched: 0, inserted: 0, attachments_saved: 0, errors: [] };

  const listResp = await gmail.users.messages.list({ userId: "me", q: query, maxResults: PAGE_SIZE });
  const messages = listResp.data.messages ?? [];
  result.fetched = messages.length;

  for (const m of messages) {
    if (!m.id) continue;
    try {
      const existing = await prisma.email_items.findUnique({ where: { gmail_message_id: m.id } });
      if (existing) continue;

      const detailResp = await gmail.users.messages.get({
        userId: "me",
        id: m.id,
        format: "full",
      });
      const detail = detailResp.data;
      const headers = Object.fromEntries(
        (detail.payload?.headers ?? []).map((h) => [h.name?.toLowerCase() ?? "", h.value ?? ""]),
      );

      // For outgoing mail, the vendor is the recipient — match against To:.
      // For incoming mail, the vendor is the sender — match against From:.
      const counterpartyRaw = direction === "outgoing" ? headers["to"] ?? "" : headers["from"] ?? "";
      const fromRaw = headers["from"] ?? "";
      const { name: counterpartyName, address: counterpartyAddress } = splitAddr(counterpartyRaw);
      const { address: fromAddress } = splitAddr(fromRaw);
      const subject = headers["subject"] ?? null;
      const snippet = detail.snippet ?? null;
      const receivedAt = detail.internalDate ? new Date(Number(detail.internalDate)) : new Date();

      const parsedIntent = inferIntent(subject, snippet, counterpartyAddress);
      const parsedAmount = extractAmount(`${subject ?? ""}\n${snippet ?? ""}`);
      const vendorGuess = counterpartyAddress
        ? await guessVendor(counterpartyAddress, counterpartyName, snippet)
        : null;

      // Auto-ignore incoming informational (marketing, etc.). Outgoing mail
      // never enters the review queue — it's stored only for thread analysis.
      const autoHandled =
        direction === "outgoing" || (direction === "incoming" && parsedIntent === "informational");

      // Pull and save PDF attachments — only useful for transactional emails.
      const attachments = await maybeSavePdfAttachments(gmail, m.id, detail, parsedIntent);
      if (attachments.length) result.attachments_saved += attachments.length;

      await prisma.email_items.create({
        data: {
          gmail_message_id: m.id,
          thread_id: detail.threadId ?? null,
          // Keep the wire header values literal — `from_address` is always the
          // real From: regardless of direction. Vendor matching uses
          // suggested_vendor_id which is direction-aware.
          from_address: fromAddress || fromRaw,
          from_name: direction === "outgoing" ? counterpartyName : splitAddr(fromRaw).name,
          subject,
          received_at: receivedAt,
          body_snippet: snippet,
          attachments_json: attachments.length ? attachments : undefined,
          parsed_intent: parsedIntent,
          parsed_amount: parsedAmount?.cents ?? null,
          parsed_vendor_guess: vendorGuess?.vendor_name ?? null,
          suggested_vendor_id: vendorGuess?.vendor_id ?? null,
          direction,
          review_status:
            direction === "outgoing" ? "processed" :
            parsedIntent === "informational" ? "ignored" : "pending_review",
          processed_at: autoHandled ? new Date() : null,
        },
      });
      result.inserted += 1;
    } catch (e) {
      result.errors.push(`${m.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (result.inserted > 0) {
    await logActivity({
      entityType: "email_poll",
      entityId: crypto.randomUUID(),
      action: direction === "outgoing" ? "polled_sent" : "polled_inbox",
      summary: `${direction === "outgoing" ? "Sent" : "Inbox"} poll: +${result.inserted}${result.attachments_saved ? ` · saved ${result.attachments_saved} attachments` : ""}`,
    });
  }

  return result;
}

// ─── Attachments ─────────────────────────────────────────

type SavedAttachment = {
  filename: string;
  mime_type: string;
  size_bytes: number;
  local_path: string;
};

async function maybeSavePdfAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  detail: gmail_v1.Schema$Message,
  intent: string,
): Promise<SavedAttachment[]> {
  // Only fetch attachments for emails that likely have a real document
  if (intent === "informational" || intent === "unknown" || intent === "scheduling") return [];

  const parts = walkParts(detail.payload ?? null);
  const pdfs = parts.filter(
    (p) =>
      p.mimeType === "application/pdf" &&
      p.body?.attachmentId &&
      (p.body.size ?? 0) > 0 &&
      (p.body.size ?? 0) <= MAX_ATTACHMENT_BYTES,
  );
  if (pdfs.length === 0) return [];

  const messageDir = path.join(ATTACHMENT_ROOT, messageId);
  await fs.promises.mkdir(messageDir, { recursive: true });

  const saved: SavedAttachment[] = [];
  for (const part of pdfs) {
    try {
      const attResp = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: part.body!.attachmentId!,
      });
      const data = attResp.data.data;
      if (!data) continue;
      // Gmail returns base64-url-encoded; decode to bytes
      const bytes = Buffer.from(data, "base64url");
      const filename = sanitizeFilename(part.filename ?? "attachment.pdf");
      const localPath = path.join(messageDir, filename);
      await fs.promises.writeFile(localPath, bytes);
      saved.push({
        filename,
        mime_type: "application/pdf",
        size_bytes: bytes.length,
        local_path: localPath,
      });
    } catch {
      // Skip on per-attachment failure; the email row still gets created
    }
  }
  return saved;
}

function walkParts(p: gmail_v1.Schema$MessagePart | null): gmail_v1.Schema$MessagePart[] {
  if (!p) return [];
  const out: gmail_v1.Schema$MessagePart[] = [];
  const visit = (node: gmail_v1.Schema$MessagePart) => {
    out.push(node);
    for (const child of node.parts ?? []) visit(child);
  };
  visit(p);
  return out;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment.pdf";
}

// ─── Reparse (unchanged from before) ─────────────────────

export async function reparseAll(): Promise<{ updated: number; auto_ignored: number; reactivated: number }> {
  const rows = await prisma.email_items.findMany({
    where: {
      direction: "incoming",
      review_status: { in: ["pending_review", "ignored"] },
    },
  });
  let updated = 0;
  let autoIgnored = 0;
  let reactivated = 0;
  for (const r of rows) {
    const intent = inferIntent(r.subject, r.body_snippet, r.from_address);
    const amount = extractAmount(`${r.subject ?? ""}\n${r.body_snippet ?? ""}`);
    const vendor = r.from_address ? await guessVendor(r.from_address, r.from_name, r.body_snippet) : null;

    let nextStatus = r.review_status;
    let nextProcessedAt = r.processed_at;
    if (r.review_status === "pending_review" && intent === "informational") {
      nextStatus = "ignored";
      nextProcessedAt = new Date();
      autoIgnored += 1;
    } else if (r.review_status === "ignored" && intent !== "informational" && r.processed_at) {
      nextStatus = "pending_review";
      nextProcessedAt = null;
      reactivated += 1;
    }

    await prisma.email_items.update({
      where: { id: r.id },
      data: {
        parsed_intent: intent,
        parsed_amount: amount?.cents ?? null,
        parsed_vendor_guess: vendor?.vendor_name ?? r.parsed_vendor_guess,
        suggested_vendor_id: vendor?.vendor_id ?? r.suggested_vendor_id,
        review_status: nextStatus,
        processed_at: nextProcessedAt,
      },
    });
    updated += 1;
  }
  return { updated, auto_ignored: autoIgnored, reactivated };
}

// ─── Helpers ─────────────────────────────────────────────

function splitAddr(raw: string): { name: string | null; address: string } {
  // "Acme <hello@acme.com>" → { name: "Acme", address: "hello@acme.com" }
  // Also handles multiple comma-separated recipients — picks the first.
  const first = raw.split(",")[0] ?? "";
  const m = first.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim();
    return { name: name || null, address: m[2].trim() };
  }
  return { name: null, address: first.trim() };
}
