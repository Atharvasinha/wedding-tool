import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "wedding_auth";

// Routes that don't require a session:
// - /auth/* — login flow itself
// - /api/auth/gmail/* — Gmail OAuth flow (its own bearer-less mechanism for now)
// - /api/cron/* — Bearer-gated by CRON_SECRET, not session
// - /api/admin/* — Bearer-gated by CRON_SECRET, not session
// - Next internals (_next, favicon, public assets)
const PUBLIC_PATHS = [
  /^\/auth\//,
  /^\/api\/auth\/gmail\//,
  /^\/api\/cron\//,
  /^\/api\/admin\//,
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => p.test(pathname))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.redirect(new URL("/auth/login?error=server", req.url));
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    const url = new URL("/auth/login", req.url);
    const resp = NextResponse.redirect(url);
    resp.cookies.delete(SESSION_COOKIE);
    return resp;
  }
}

export const config = {
  // Match everything except Next.js internals + static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
