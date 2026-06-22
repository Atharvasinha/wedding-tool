import { getAllPayers } from "@/lib/db/payers";
import { Money } from "@/components/Money";
import { PayerRow } from "./PayerRow";
import { AddPayerInline } from "./AddPayerInline";
import { SyncSheetsButton } from "./SyncSheetsButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const payers = await getAllPayers();
  const sheetsConfigured = !!process.env.SHEETS_MIRROR_ID && !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;

  return (
    <div className="px-10 py-9 max-w-[800px]">
      <div className="text-xs text-ink-muted mono uppercase tracking-widest">Settings</div>
      <h1 className="display text-[36px] leading-tight mt-1">Payers</h1>
      <div className="text-sm text-ink-soft mt-1">Who's paying for what. Three pre-seeded; add more if needed.</div>

      <div className="mt-8 rounded-lg border border-rule bg-cream-soft/40 overflow-hidden">
        <table className="w-full">
          <thead className="bg-cream-deep/60 text-[11px] uppercase tracking-widest text-ink-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Color</th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-right px-4 py-3 font-medium">Cap (optional)</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {payers.map((p) => (
              <PayerRow
                key={p.id}
                id={p.id}
                name={p.name}
                color={p.display_color}
                cap={p.total_committed}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5">
        <AddPayerInline />
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between border-b border-rule pb-2">
          <h2 className="display text-[20px] italic">Google Sheet mirror</h2>
        </div>
        <p className="text-xs text-ink-muted mt-2 mb-4">
          A read-only spreadsheet view of all data. Synced daily; you can also trigger a sync manually.
        </p>
        <SyncSheetsButton configured={sheetsConfigured} />
      </section>

      <div className="mt-12 rounded-lg border border-rule bg-cream-soft/30 p-5 text-xs text-ink-muted">
        Wedding baseline is locked at <Money cents={BigInt(14268200)} />.
      </div>
    </div>
  );
}
