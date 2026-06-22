"use server";

import { revalidatePath } from "next/cache";
import { syncToSheets } from "@/lib/sheets/sync";
import { logActivity } from "@/lib/activity";

export async function triggerSheetsSync() {
  const result = await syncToSheets();
  await logActivity({
    entityType: "sheets_sync",
    entityId: crypto.randomUUID(),
    action: "synced",
    summary: `Manual sync: ${result.tabs} tabs · ${result.rows_total} rows · ${result.elapsed_ms}ms`,
  });
  revalidatePath("/settings");
  return result;
}
