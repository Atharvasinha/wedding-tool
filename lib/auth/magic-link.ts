// Magic-link auth: generate a one-time token, hash and store it, send the
// link via Resend. The /auth/verify route exchanges the token for a session.

import * as crypto from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db/client";

const TOKEN_TTL_MIN = 15;

export type MagicLinkResult =
  | { ok: true; sent_to: string }
  | { ok: false; reason: "not_allowed" | "send_failed"; error?: string };

export async function requestMagicLink(rawEmail: string): Promise<MagicLinkResult> {
  const email = rawEmail.toLowerCase().trim();

  // 1. Must be on the allowlist
  const allowed = await prisma.allowed_users.findUnique({ where: { email } });
  if (!allowed) {
    // Generic response — don't reveal whether the email is allowed
    return { ok: false, reason: "not_allowed" };
  }

  // 2. Generate a token, store its SHA-256 hash (never the raw token)
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

  await prisma.magic_link_tokens.create({
    data: { email, token_hash: tokenHash, expires_at: expiresAt },
  });

  // 3. Send the email
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const link = `${appUrl}/auth/verify?token=${token}`;
  const result = await sendMagicLinkEmail(email, link);
  if (!result.ok) {
    return { ok: false, reason: "send_failed", error: result.error };
  }

  return { ok: true, sent_to: email };
}

export async function consumeMagicLink(token: string): Promise<{ email: string } | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await prisma.magic_link_tokens.findUnique({ where: { token_hash: tokenHash } });
  if (!row) return null;
  if (row.used_at) return null;
  if (row.expires_at < new Date()) return null;
  await prisma.magic_link_tokens.update({
    where: { token_hash: tokenHash },
    data: { used_at: new Date() },
  });
  return { email: row.email };
}

async function sendMagicLinkEmail(
  to: string,
  link: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  if (!apiKey) {
    // Dev fallback — log the link instead of sending. Lets you sign in locally
    // without Resend configured.
    console.log(`[dev] magic link for ${to}: ${link}`);
    return { ok: true };
  }
  const resend = new Resend(apiKey);
  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: "Sign in to the Wedding Tool",
      html: magicLinkHtml(link),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function magicLinkHtml(link: string): string {
  return `<!doctype html>
<html><body style="font-family:Georgia,serif;background:#F8F2E6;color:#1A1614;padding:40px 20px;max-width:560px;margin:0 auto;">
  <div style="background:#FFF;padding:32px;border-radius:8px;">
    <h1 style="font-weight:400;font-size:28px;margin:0 0 16px;color:#B8451E;">Sign in</h1>
    <p style="line-height:1.6;margin:0 0 24px;">Click the link below to sign in to the Wedding Tool. The link expires in 15 minutes.</p>
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#B8451E;color:#F8F2E6;text-decoration:none;padding:12px 24px;border-radius:4px;">Sign in</a>
    </p>
    <p style="font-size:12px;color:#736961;line-height:1.5;margin:24px 0 0;">If you didn't request this, ignore this email — no action needed.</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
