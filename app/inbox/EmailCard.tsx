"use client";

import { useState, useTransition } from "react";
import type { email_items, vendors } from "@prisma/client";
import { Clock, Inbox, Link2, Plus, Trash2, ChevronDown, UserPlus, Sparkles, Check, Wand2, Paperclip, Reply } from "lucide-react";
import { Money } from "@/components/Money";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/format";
import { parseDollars } from "@/lib/utils";
import type { Suggestion } from "@/lib/parsing/workflow";
import {
  aiSuggestEmail,
  attachEmailToVendor,
  createEstimateFromEmail,
  createPaymentFromEmail,
  createVendorFromEmail,
  ignoreEmail,
  markPaymentPaidFromEmail,
  snoozeEmail,
  unsnoozeEmail,
} from "@/lib/actions/email";

const VENDOR_CATEGORIES = [
  "venue", "catering", "photography", "videography", "dj_band", "florist",
  "rentals", "hair_makeup", "attire", "transportation", "stationery",
  "officiant", "priest", "planner", "accommodation", "other",
] as const;

type VendorOpt = Pick<vendors, "id" | "name" | "category">;

type Props = {
  email: email_items & { suggested_vendor: { id: string; name: string } | null };
  vendors: VendorOpt[];
  variant: "pending" | "snoozed";
  suggestion?: Suggestion | null;
  awaitingReply?: boolean;
  attachmentCount?: number;
};

export function EmailCard({ email, vendors, variant, suggestion, awaitingReply, attachmentCount }: Props) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  // Local override — clicking "AI parse" replaces the rules-based suggestion.
  const [liveSuggestion, setLiveSuggestion] = useState<Suggestion | null | undefined>(suggestion);
  const [suggestionSource, setSuggestionSource] = useState<"rules" | "ai">("rules");
  const [aiTokens, setAiTokens] = useState<string | null>(null);
  const [aiPending, startAiTransition] = useTransition();

  const suggested = email.suggested_vendor;
  const amount = email.parsed_amount;

  const onAiParse = () => {
    setAiTokens(null);
    startAiTransition(async () => {
      try {
        const result = await aiSuggestEmail(email.id);
        setLiveSuggestion(result.suggestion);
        setSuggestionSource("ai");
        const totalIn = result.usage.input_tokens + result.usage.cached_tokens;
        setAiTokens(
          `Haiku · ${totalIn} in (${result.usage.cached_tokens} cached) / ${result.usage.output_tokens} out`,
        );
      } catch (e) {
        setAiTokens(e instanceof Error ? e.message : "AI parse failed");
      }
    });
  };

  return (
    <div className="rounded-md border border-rule bg-cream-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] text-ink-muted">
            <StatusBadge value={email.parsed_intent} />
            <span>{formatDate(email.received_at)}</span>
            <span>·</span>
            <span className="mono truncate">{email.from_address}</span>
            {attachmentCount && attachmentCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-ink-muted" title={`${attachmentCount} PDF attachment(s)`}>
                <Paperclip size={10} /> {attachmentCount}
              </span>
            ) : null}
            {awaitingReply ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/10 text-terracotta px-1.5 py-0.5" title="No reply sent yet">
                <Reply size={10} /> needs reply
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 text-sm font-medium leading-snug">{email.subject ?? "(no subject)"}</div>
          {email.body_snippet ? (
            <div className="mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2">{email.body_snippet}</div>
          ) : null}

          <div className="mt-3 flex items-center gap-4 text-xs">
            {amount ? (
              <div>
                <span className="text-ink-muted">amount detected </span>
                <Money cents={amount} className="text-sm" />
              </div>
            ) : null}
            {suggested ? (
              <div className="flex items-center gap-1.5">
                <Link2 size={12} className="text-teal" />
                <span className="text-ink-muted">suggested</span>
                <span className="text-teal">{suggested.name}</span>
              </div>
            ) : null}
          </div>

          {variant === "pending" && liveSuggestion ? (
            <SuggestionBanner
              email={email}
              suggestion={liveSuggestion}
              source={suggestionSource}
              pending={pending}
              startTransition={startTransition}
              onAiParse={onAiParse}
              aiPending={aiPending}
              aiTokensLabel={aiTokens}
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {variant === "pending" ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 rounded border border-rule bg-cream px-2.5 py-1 text-xs hover:bg-cream-deep"
              >
                process <ChevronDown size={12} className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => snoozeEmail(email.id))}
                className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-xs text-ink-muted hover:bg-cream-deep hover:text-ink"
              >
                <Clock size={11} /> snooze
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => ignoreEmail(email.id))}
                className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-xs text-terracotta hover:bg-terracotta/10"
                title="Mark this email as not relevant — it stays in the archive but leaves the queue"
              >
                <Trash2 size={11} /> not relevant
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => unsnoozeEmail(email.id))}
              className="inline-flex items-center gap-1 rounded border border-rule bg-cream px-2.5 py-1 text-xs hover:bg-cream-deep"
            >
              <Inbox size={11} /> unsnooze
            </button>
          )}
        </div>
      </div>

      {expanded && variant === "pending" ? (
        <ProcessPanel email={email} vendors={vendors} suggestedId={suggested?.id ?? null} amount={amount} pending={pending} startTransition={startTransition} />
      ) : null}
    </div>
  );
}

function ProcessPanel({
  email,
  vendors,
  suggestedId,
  amount,
  pending,
  startTransition,
}: {
  email: email_items;
  vendors: VendorOpt[];
  suggestedId: string | null;
  amount: bigint | null;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [vendorId, setVendorId] = useState<string>(suggestedId ?? vendors[0]?.id ?? "");
  const [amountStr, setAmountStr] = useState(amount ? (Number(amount) / 100).toString() : "");
  const [pkg, setPkg] = useState("");

  // Defaults for "create new vendor": use the email's From name, or derive
  // from the sender's domain if no name is present.
  const defaultVendorName = email.from_name?.trim() || deriveNameFromAddress(email.from_address);
  const [newName, setNewName] = useState(defaultVendorName);
  const [newCategory, setNewCategory] = useState<(typeof VENDOR_CATEGORIES)[number]>("other");

  const canEstimate = vendorId && parseDollars(amountStr);
  const canCreateVendor = newName.trim().length > 0;

  return (
    <div className="mt-4 pt-4 border-t border-rule space-y-4">
      {/* — attach to existing — */}
      <div className="space-y-2">
        <div className="text-[11px] uppercase tracking-widest text-ink-muted">Attach to existing vendor</div>
        <div className="flex items-center gap-2">
          <select
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="flex-1 rounded border border-rule bg-cream px-2 py-1.5 text-sm"
          >
            {vendors.length === 0 ? <option value="">(no vendors yet — create one below)</option> : null}
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name} · {v.category.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !vendorId}
            onClick={() => startTransition(() => attachEmailToVendor({ emailId: email.id, vendorId }))}
            className="inline-flex items-center gap-1 rounded bg-teal text-cream px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-teal/90"
          >
            <Link2 size={12} /> attach
          </button>
        </div>
      </div>

      {/* — create new vendor — */}
      <div className="space-y-2 pt-3 border-t border-dashed border-rule">
        <div className="text-[11px] uppercase tracking-widest text-ink-muted">or create a new vendor from this email</div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Vendor name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-rule bg-cream px-2 py-1.5 text-sm"
          />
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as never)}
            className="rounded border border-rule bg-cream px-2 py-1.5 text-sm"
          >
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !canCreateVendor}
            onClick={() =>
              startTransition(() =>
                createVendorFromEmail({
                  emailId: email.id,
                  name: newName.trim(),
                  category: newCategory,
                }),
              )
            }
            className="inline-flex items-center gap-1 rounded bg-gold text-cream px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-gold/90"
          >
            <UserPlus size={12} /> create vendor
          </button>
        </div>
        <div className="text-[11px] text-ink-muted">
          Contact email <span className="mono">{email.from_address}</span> will be set automatically.
        </div>
      </div>

      {/* — create estimate — */}
      <div className="space-y-2 pt-3 border-t border-dashed border-rule">
        <div className="text-[11px] uppercase tracking-widest text-ink-muted">or create an estimate</div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Package (optional)"
            value={pkg}
            onChange={(e) => setPkg(e.target.value)}
            className="flex-1 rounded border border-rule bg-cream px-2 py-1.5 text-sm"
          />
          <input
            placeholder="$"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="rounded border border-rule bg-cream px-2 py-1.5 text-sm tabular mono w-24"
          />
          <button
            type="button"
            disabled={pending || !canEstimate}
            onClick={() => {
              const cents = parseDollars(amountStr);
              if (!cents || !vendorId) return;
              startTransition(() =>
                createEstimateFromEmail({ emailId: email.id, vendorId, amount_cents: cents, package_name: pkg || undefined }),
              );
            }}
            className="inline-flex items-center gap-1 rounded bg-terracotta text-cream px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-terracotta-deep"
          >
            <Plus size={12} /> create estimate
          </button>
        </div>
        <div className="text-[11px] text-ink-muted">
          Uses the vendor selected above. Amount{amount ? " pre-filled from parsing" : ""}.
        </div>
      </div>
    </div>
  );
}

// Turn "hello@bettsevents.com" into "Bettsevents" — best-effort default for
// the "create vendor" name field when From-name is missing.
function deriveNameFromAddress(addr: string): string {
  const domain = addr.split("@")[1] ?? addr;
  const root = domain.split(".")[0] ?? "";
  if (!root) return "";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

// ──────────────────────────────────────────────────────────────
// Suggestion banner — the one-click apply for the workflow engine's pick
// ──────────────────────────────────────────────────────────────
function SuggestionBanner({
  email,
  suggestion,
  source,
  pending,
  startTransition,
  onAiParse,
  aiPending,
  aiTokensLabel,
}: {
  email: email_items;
  suggestion: Suggestion;
  source: "rules" | "ai";
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onAiParse: () => void;
  aiPending: boolean;
  aiTokensLabel: string | null;
}) {
  const sourceLabel = source === "ai" ? "Suggestion from AI" : "Suggested";
  const sourceColor = source === "ai" ? "text-gold" : "text-teal";
  const sourceBorder = source === "ai" ? "border-gold/30 bg-gold/5" : "border-teal/30 bg-teal/5";
  const sourceIcon = source === "ai" ? "text-gold" : "text-teal";
  const aiButton = (
    <button
      type="button"
      disabled={aiPending || pending}
      onClick={onAiParse}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-gold/40 bg-gold/10 px-2 py-1 text-[11px] text-gold hover:bg-gold/20 disabled:opacity-50"
      title="Use Claude Haiku 4.5 to re-classify this email"
    >
      <Wand2 size={11} className={aiPending ? "animate-pulse" : ""} />
      {aiPending ? "Asking AI…" : "AI parse"}
    </button>
  );

  // "review" — weak suggestion; show reason + AI button so user can try Haiku
  if (suggestion.kind === "review") {
    return (
      <>
        <div className={`mt-3 flex items-start justify-between gap-2 rounded border px-3 py-2 text-xs ${source === "ai" ? sourceBorder + " text-ink-soft" : "border-rule bg-cream-deep/40 text-ink-muted"}`}>
          <div className="flex items-start gap-2 min-w-0">
            {source === "ai" ? (
              <Wand2 size={12} className={`mt-0.5 shrink-0 ${sourceIcon}`} />
            ) : (
              <Sparkles size={12} className="mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              {source === "ai" ? (
                <div className={`text-[10px] uppercase tracking-widest font-medium ${sourceColor}`}>{sourceLabel}</div>
              ) : null}
              <span>{suggestion.reason}</span>
            </div>
          </div>
          {aiButton}
        </div>
        {aiTokensLabel ? <div className="mt-1 text-[10px] text-ink-muted/70 mono text-right">{aiTokensLabel}</div> : null}
      </>
    );
  }

  const cta = ctaForSuggestion(suggestion);
  const onApply = () => startTransition(() => applySuggestion(email.id, suggestion));

  return (
    <>
      <div className={`mt-3 flex items-center justify-between gap-3 rounded border px-3 py-2 ${sourceBorder}`}>
        <div className="flex items-start gap-2 text-xs min-w-0">
          {source === "ai" ? (
            <Wand2 size={12} className={`mt-0.5 shrink-0 ${sourceIcon}`} />
          ) : (
            <Sparkles size={12} className={`mt-0.5 shrink-0 ${sourceIcon}`} />
          )}
          <div className="min-w-0">
            <div className={`text-[10px] uppercase tracking-widest font-medium ${sourceColor}`}>{sourceLabel}</div>
            <div className="text-ink-soft">{suggestion.reason}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aiButton}
          <button
            type="button"
            disabled={pending || aiPending}
            onClick={onApply}
            className="inline-flex items-center gap-1 rounded bg-teal text-cream px-3 py-1.5 text-xs disabled:opacity-50 hover:bg-teal/90"
          >
            <Check size={12} /> {cta}
          </button>
        </div>
      </div>
      {aiTokensLabel ? <div className="mt-1 text-[10px] text-ink-muted/70 mono text-right">{aiTokensLabel}</div> : null}
    </>
  );
}

function ctaForSuggestion(s: Suggestion): string {
  switch (s.kind) {
    case "create_vendor":   return `Create "${s.defaults.name}"`;
    case "create_estimate": return "Create estimate";
    case "create_contract": return "Create contract";
    case "create_payment":  return s.defaults.alreadyPaid ? "Record as paid" : "Schedule payment";
    case "mark_payment_paid": return "Mark paid";
    case "attach":          return `Attach to ${s.defaults.vendorName}`;
    case "review":          return "";
  }
}

async function applySuggestion(emailId: string, s: Suggestion): Promise<void> {
  switch (s.kind) {
    case "create_vendor":
      return createVendorFromEmail({
        emailId,
        name: s.defaults.name,
        category: s.defaults.category,
      });
    case "create_estimate":
      return createEstimateFromEmail({
        emailId,
        vendorId: s.defaults.vendorId,
        amount_cents: s.defaults.amountCents,
        package_name: s.defaults.packageName || undefined,
      });
    case "create_payment":
      return createPaymentFromEmail({
        emailId,
        vendorId: s.defaults.vendorId,
        contractId: s.defaults.contractId,
        amount_cents: s.defaults.amountCents,
        due_date: s.defaults.dueDate.toISOString().slice(0, 10),
        description: s.defaults.description,
        already_paid: s.defaults.alreadyPaid,
        paid_date: s.defaults.paidDate?.toISOString().slice(0, 10),
      });
    case "mark_payment_paid":
      return markPaymentPaidFromEmail({
        emailId,
        paymentId: s.defaults.paymentId,
        paid_date: s.defaults.paidDate.toISOString().slice(0, 10),
      });
    case "create_contract":
      // No dedicated server action yet; fall back to attach + manual contract creation
      return attachEmailToVendor({ emailId, vendorId: s.defaults.vendorId });
    case "attach":
      return attachEmailToVendor({ emailId, vendorId: s.defaults.vendorId });
    case "review":
      return;
  }
}
