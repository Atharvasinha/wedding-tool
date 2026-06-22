import { prisma } from "@/lib/db/client";
import { getCurrentUserEmail } from "@/lib/auth";

type LogArgs = {
  entityType: string;
  entityId: string;
  action: string;
  summary?: string;
  before?: unknown;
  after?: unknown;
  changedBy?: string;
};

export async function logActivity({
  entityType,
  entityId,
  action,
  summary,
  before,
  after,
  changedBy,
}: LogArgs) {
  await prisma.activity_log.create({
    data: {
      entity_type: entityType,
      entity_id: entityId,
      action,
      changed_by: changedBy ?? getCurrentUserEmail(),
      diff_summary: summary ?? null,
      diff_json:
        before === undefined && after === undefined
          ? undefined
          : (JSON.parse(JSON.stringify({ before, after }, jsonSafeReplacer)) as object),
    },
  });
}

function jsonSafeReplacer(_key: string, value: unknown) {
  if (typeof value === "bigint") return value.toString();
  return value;
}
