import { LoginForm } from "./LoginForm";

export default function LoginPage({ searchParams }: { searchParams: { error?: string; sent?: string } }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="display text-[32px] leading-tight">
          Atharva <span className="italic">&amp;</span> Celesia
        </div>
        <div className="text-xs text-ink-muted mt-1 mono">12 · 11 · 2027</div>

        <div className="mt-10 rounded-lg border border-rule bg-cream-soft p-6">
          <h1 className="display text-[20px] italic">Sign in</h1>
          <p className="text-xs text-ink-muted mt-1">We'll email you a one-time link.</p>

          {searchParams.sent ? (
            <div className="mt-5 rounded border border-teal/30 bg-teal/5 px-3 py-2.5 text-sm text-teal">
              Check your email — link sent to <span className="mono">{searchParams.sent}</span>.
            </div>
          ) : null}

          {searchParams.error ? (
            <div className="mt-5 rounded border border-terracotta/30 bg-terracotta/5 px-3 py-2.5 text-sm text-terracotta">
              {errorMessage(searchParams.error)}
            </div>
          ) : null}

          <LoginForm />
        </div>
      </div>
    </div>
  );
}

function errorMessage(code: string): string {
  if (code === "not_allowed") return "If that email is on the allowlist, a link is on its way.";
  if (code === "invalid_token") return "That link is invalid or expired. Request a new one.";
  if (code === "send_failed") return "Failed to send the email. Try again in a moment.";
  return "Something went wrong.";
}
