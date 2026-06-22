import { NextRequest, NextResponse } from "next/server";
import { pollGmail, reparseAll } from "@/lib/gmail/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds

export async function GET(req: NextRequest) {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
  // Also accept ?key=<CRON_SECRET> for local manual testing.
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  if (secret) {
    const auth = req.headers.get("authorization");
    const queryKey = url.searchParams.get("key");
    const ok = auth === `Bearer ${secret}` || queryKey === secret;
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const action = url.searchParams.get("action");
  try {
    if (action === "reparse") {
      const result = await reparseAll();
      return NextResponse.json({ ok: true, action: "reparse", ...result });
    }
    const result = await pollGmail();
    return NextResponse.json({ ok: true, action: "poll", ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Also support POST for the in-app "Poll now" button (uses fetch with same auth)
export const POST = GET;
