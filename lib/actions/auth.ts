"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requestMagicLink, type MagicLinkResult } from "@/lib/auth/magic-link";
import { logActivity } from "@/lib/activity";

export async function requestLogin(email: string): Promise<MagicLinkResult> {
  return requestMagicLink(email);
}

const AddSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
});

export async function addAllowedUser(input: z.input<typeof AddSchema>) {
  const data = AddSchema.parse(input);
  const created = await prisma.allowed_users.upsert({
    where: { email: data.email.toLowerCase() },
    create: { email: data.email.toLowerCase(), name: data.name ?? null, role: "editor" },
    update: { name: data.name ?? null },
  });
  await logActivity({
    entityType: "allowed_user",
    entityId: created.id,
    action: "added",
    summary: `Added ${created.email} to allowlist`,
  });
  revalidatePath("/settings");
}

export async function removeAllowedUser(id: string) {
  const before = await prisma.allowed_users.findUniqueOrThrow({ where: { id } });
  await prisma.allowed_users.delete({ where: { id } });
  await logActivity({
    entityType: "allowed_user",
    entityId: id,
    action: "removed",
    summary: `Removed ${before.email} from allowlist`,
  });
  revalidatePath("/settings");
}
