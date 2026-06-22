import Link from "next/link";
import { getInboxItems } from "@/lib/db/email";
import { getActiveVendors } from "@/lib/db/vendors";
import { suggestBatch } from "@/lib/parsing/workflow";
import { EmptyState } from "@/components/EmptyState";
import { EmailCard } from "./EmailCard";
import { PollNowButton } from "./PollNowButton";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const [{ pending, snoozed, processed }, vendors] = await Promise.all([
    getInboxItems(),
    getActiveVendors(),
  ]);
  const suggestions = await suggestBatch(pending);
  const vendorOptions = vendors.map((v) => ({ id: v.id, name: v.name, category: v.category }));
  const gmailConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GMAIL_REFRESH_TOKEN);

  return (
    <div className="px-10 py-9 max-w-[1000px]">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-muted mono uppercase tracking-widest">Inbox</div>
          <h1 className="display text-[36px] leading-tight mt-1">Email queue</h1>
          <div className="text-sm text-ink-soft mt-1">
            Polled from <span className="mono">{process.env.GMAIL_ACCOUNT ?? "celesia.atharva@gmail.com"}</span> every 5 min.
          </div>
        </div>
        <PollNowButton enabled={gmailConfigured} />
      </div>

      {!gmailConfigured ? (
        <ConfigurationNeeded />
      ) : (
        <>
          <Section title="Needs review" hint={`${pending.length} pending`}>
            {pending.length === 0 ? (
              <EmptyState title="Inbox is clear" description="New emails will appear here for review." />
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((e) => (
                  <EmailCard
                    key={e.id}
                    email={e}
                    vendors={vendorOptions}
                    variant="pending"
                    suggestion={suggestions.get(e.id) ?? null}
                    awaitingReply={e.awaiting_reply}
                    attachmentCount={Array.isArray(e.attachments_json) ? e.attachments_json.length : 0}
                  />
                ))}
              </div>
            )}
          </Section>

          {snoozed.length > 0 ? (
            <Section title="Snoozed" hint={`${snoozed.length}`}>
              <div className="flex flex-col gap-3">
                {snoozed.map((e) => (
                  <EmailCard
                    key={e.id}
                    email={e}
                    vendors={vendorOptions}
                    variant="snoozed"
                    awaitingReply={e.awaiting_reply}
                    attachmentCount={Array.isArray(e.attachments_json) ? e.attachments_json.length : 0}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          {processed.length > 0 ? (
            <Section title="Recently processed" hint="last 15">
              <div className="flex flex-col divide-y divide-rule border border-rule rounded-md bg-cream-soft/30">
                {processed.map((e) => (
                  <div key={e.id} className="px-4 py-2.5 text-xs text-ink-muted flex items-center gap-3">
                    <span className="uppercase tracking-widest text-[10px] w-20">{e.review_status}</span>
                    <span className="flex-1 truncate text-ink-soft">{e.subject ?? "(no subject)"}</span>
                    <span className="mono">{e.from_address}</span>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between border-b border-rule pb-2 mb-5">
        <h2 className="display text-[20px] italic">{title}</h2>
        {hint ? <div className="text-[11px] uppercase tracking-widest text-ink-muted">{hint}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ConfigurationNeeded() {
  return (
    <div className="mt-10 rounded-lg border border-dashed border-terracotta/40 bg-cream-soft/50 p-6 text-sm">
      <div className="display italic text-terracotta text-base">Gmail not connected yet</div>
      <p className="mt-3 text-ink-soft">
        Add <code className="mono bg-cream-deep px-1 rounded">GOOGLE_CLIENT_ID</code>,{" "}
        <code className="mono bg-cream-deep px-1 rounded">GOOGLE_CLIENT_SECRET</code>, and the redirect URI to <code className="mono bg-cream-deep px-1 rounded">.env.local</code>{" "}
        (see the plan file for the Google Cloud setup), then visit{" "}
        <Link href={"/api/auth/gmail/start" as never} className="text-terracotta underline">/api/auth/gmail/start</Link>{" "}
        to complete OAuth and capture the refresh token.
      </p>
      <p className="mt-2 text-ink-muted text-xs">
        Once the refresh token is in <code className="mono">GMAIL_REFRESH_TOKEN</code>, this screen activates and polls every 5 min in production.
      </p>
    </div>
  );
}
