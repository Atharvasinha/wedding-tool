import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = buildAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "OAuth not configured" },
      { status: 500 },
    );
  }
}
