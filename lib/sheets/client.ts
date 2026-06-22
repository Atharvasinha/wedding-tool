import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";

export function getSheetsClient(): sheets_v4.Sheets {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 not set");
  }
  const json = Buffer.from(b64, "base64").toString("utf8");
  const credentials = JSON.parse(json) as {
    client_email: string;
    private_key: string;
  };

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export function getSheetId(): string {
  const id = process.env.SHEETS_MIRROR_ID;
  if (!id) throw new Error("SHEETS_MIRROR_ID not set");
  return id;
}
