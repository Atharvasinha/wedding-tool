import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

// Bootstrap the allowlist before any user can sign in.
// Hit with:  curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
//   "https://wedding-tool.vercel.app/api/admin/seed-allowlist?emails=a@b.com,c@d.com"
// Idempotent: upserts each email, won't error on duplicates.

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const url = new URL(req.url);
  const emailsParam = url.searchParams.get("emails");
  if (!emailsParam) {
    return NextResponse.json(
      { error: "missing ?emails=a@b.com,c@d.com" },
      { status: 400 },
    );
  }
  const emails = emailsParam
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (emails.length === 0) {
    return NextResponse.json({ error: "no valid emails parsed" }, { status: 400 });
  }
  const results: { email: string; created: boolean }[] = [];
  for (const email of emails) {
    const existing = await prisma.allowed_users.findUnique({ where: { email } });
    if (existing) {
      results.push({ email, created: false });
      continue;
    }
    await prisma.allowed_users.create({
      data: { email, role: "editor" },
    });
    results.push({ email, created: true });
  }
  return NextResponse.json({ ok: true, results });
}

export const GET = POST;
