import Link from "next/link";
import { Home, Wallet, Users, ListChecks, Inbox, Settings } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/budget", label: "Budget", icon: Wallet },
  { href: "/vendors", label: "Vendors", icon: Users },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function NavSidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-rule bg-cream-soft px-5 py-7 hidden md:flex md:flex-col gap-7">
      <div>
        <div className="display text-[22px] leading-tight">
          Atharva <span className="italic">&amp;</span> Celesia
        </div>
        <div className="text-xs text-ink-muted mt-1 mono">12 · 11 · 2027</div>
      </div>

      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href as never}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-soft hover:bg-cream-deep hover:text-ink transition-colors"
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto text-[11px] text-ink-muted leading-relaxed">
        Camp Lucy · Texas<br />
        ~125 guests
      </div>
    </aside>
  );
}
