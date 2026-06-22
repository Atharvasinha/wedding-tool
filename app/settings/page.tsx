import { getAllPayers } from "@/lib/db/payers";
import { Money } from "@/components/Money";
import { PayerRow } from "./PayerRow";
import { AddPayerInline } from "./AddPayerInline";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const payers = await getAllPayers();

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

      <div className="mt-12 rounded-lg border border-rule bg-cream-soft/30 p-5 text-xs text-ink-muted">
        <div className="display italic text-sm text-ink-soft mb-2">Coming later</div>
        Email allowlist for magic-link auth lands in Phase 5. Gmail polling and Sheets mirror in Phases 3–4. Wedding baseline is locked at <Money cents={BigInt(14268200)} />.
      </div>
    </div>
  );
}
