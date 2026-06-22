"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { addAllowedUser, removeAllowedUser } from "@/lib/actions/auth";

type Row = { id: string; email: string; name: string | null };

export function AllowlistTable({ users }: { users: Row[] }) {
  const [pending, startTransition] = useTransition();
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  return (
    <div>
      <table className="w-full">
        <thead className="text-[11px] uppercase tracking-widest text-ink-muted">
          <tr>
            <th className="text-left py-2 px-3 font-medium">Email</th>
            <th className="text-left py-2 px-3 font-medium">Name</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {users.length === 0 ? (
            <tr>
              <td colSpan={3} className="py-4 px-3 text-xs text-ink-muted italic">
                No one on the allowlist yet. Anyone signing in is blocked.
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <tr key={u.id} className="hover:bg-cream-soft/60">
                <td className="py-2.5 px-3 text-sm mono">{u.email}</td>
                <td className="py-2.5 px-3 text-sm">{u.name ?? "—"}</td>
                <td className="py-2.5 px-3 text-right">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => startTransition(() => removeAllowedUser(u.id))}
                    className="text-ink-muted hover:text-terracotta disabled:opacity-50"
                    title="Remove from allowlist"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-muted">Email</label>
          <input
            type="email"
            placeholder="someone@gmail.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="mt-1 w-full rounded border border-rule bg-cream-soft px-3 py-2 text-sm"
          />
        </div>
        <div className="w-40">
          <label className="text-[11px] uppercase tracking-widest text-ink-muted">Name (optional)</label>
          <input
            placeholder="Atharva"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mt-1 w-full rounded border border-rule bg-cream-soft px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={pending || !newEmail.trim()}
          onClick={() => {
            startTransition(async () => {
              await addAllowedUser({ email: newEmail.trim(), name: newName.trim() || undefined });
              setNewEmail("");
              setNewName("");
            });
          }}
          className="inline-flex items-center gap-1 rounded bg-ink text-cream px-3 py-2 text-sm disabled:opacity-50"
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}
