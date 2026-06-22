"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestLogin } from "@/lib/actions/auth";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;
        startTransition(async () => {
          const res = await requestLogin(trimmed);
          // Always behave the same way to avoid leaking whether email is on the
          // allowlist. If genuinely not_allowed, the "sent" toast is a white lie.
          if (res.ok || res.reason === "not_allowed") {
            router.push(`/auth/login?sent=${encodeURIComponent(trimmed)}` as never);
          } else {
            router.push(`/auth/login?error=${encodeURIComponent(res.reason)}` as never);
          }
        });
      }}
    >
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border border-rule bg-cream px-3 py-2 text-sm focus:outline-none focus:border-terracotta/50"
      />
      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="mt-3 w-full rounded bg-terracotta text-cream px-3 py-2 text-sm hover:bg-terracotta-deep disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}
