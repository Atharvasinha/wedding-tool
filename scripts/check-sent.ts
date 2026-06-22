import { config } from "dotenv";
config({ path: ".env.local" });

import { getGmailClientFromRefreshToken } from "../lib/gmail/client";

async function main() {
  const gmail = getGmailClientFromRefreshToken(process.env.GMAIL_REFRESH_TOKEN!);
  const sent = await gmail.users.messages.list({
    userId: "me",
    q: "in:sent newer_than:14d -in:chats -in:drafts",
    maxResults: 50,
  });
  console.log("Sent messages found:", sent.data.messages?.length ?? 0);
  for (const m of (sent.data.messages ?? []).slice(0, 10)) {
    if (!m.id) continue;
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: m.id,
      format: "metadata",
      metadataHeaders: ["From", "To", "Subject", "Date"],
    });
    const h = Object.fromEntries((detail.data.payload?.headers ?? []).map((x) => [x.name?.toLowerCase(), x.value]));
    console.log(`  ${detail.data.internalDate?.slice(0, 4)} | TO: ${h.to?.slice(0, 60)} | ${h.subject?.slice(0, 60)}`);
  }
}

main().catch(console.error);
