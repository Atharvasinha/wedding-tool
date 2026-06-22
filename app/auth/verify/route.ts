import { NextRequest, NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth/magic-link";
import { createSession, setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid_token", req.url));
  }
  const result = await consumeMagicLink(token);
  if (!result) {
    return NextResponse.redirect(new URL("/auth/login?error=invalid_token", req.url));
  }
  const jwt = await createSession(result.email);
  await setSessionCookie(jwt);
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
