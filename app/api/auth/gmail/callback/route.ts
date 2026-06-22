import { NextRequest, NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/gmail/client";

export const dynamic = "force-dynamic";

// One-shot OAuth callback: exchanges the auth code for tokens and shows the
// refresh_token so you can paste it into .env.local (dev) or Vercel env (prod).
// We deliberately do NOT auto-write to .env.local — too easy to clobber.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new NextResponse(html(`<h1>OAuth error</h1><p>${escape(error)}</p>`), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (!code) {
    return new NextResponse(html(`<h1>Missing ?code= parameter</h1>`), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  try {
    const oauth = getOAuthClient();
    const { tokens } = await oauth.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      return new NextResponse(
        html(`
          <h1>No refresh token returned</h1>
          <p>Google only issues a refresh_token on the first consent. Either:</p>
          <ol>
            <li>Revoke the app's access at <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a> then retry <a href="/api/auth/gmail/start">/api/auth/gmail/start</a>, or</li>
            <li>Check that <code>prompt=consent</code> is set in <code>lib/gmail/client.ts</code> (it should be).</li>
          </ol>
        `),
        { status: 400, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    return new NextResponse(
      html(`
        <h1>Gmail connected</h1>
        <p>Paste this into <code>.env.local</code> (and into your Vercel env vars for production):</p>
        <pre style="background:var(--cream-deep);padding:1rem;border-radius:6px;word-break:break-all;white-space:pre-wrap;">GMAIL_REFRESH_TOKEN="${escape(refreshToken)}"</pre>
        <p>Then restart <code>npm run dev</code> and head to <a href="/inbox">/inbox</a> to poll.</p>
      `),
      { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    return new NextResponse(
      html(`<h1>Token exchange failed</h1><pre>${escape(err instanceof Error ? err.message : String(err))}</pre>`),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function html(inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Gmail OAuth</title>
<style>
  :root { --cream:#F8F2E6; --cream-deep:#EADFC6; --ink:#1A1614; --terracotta:#B8451E; }
  body { font-family: -apple-system, system-ui, sans-serif; background: var(--cream); color: var(--ink); max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; }
  h1 { color: var(--terracotta); font-weight: 500; }
  code { background: var(--cream-deep); padding: 1px 4px; border-radius: 3px; }
  a { color: var(--terracotta); }
</style>
</head><body>${inner}</body></html>`;
}
