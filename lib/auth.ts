import { getCurrentSession } from "@/lib/auth/session";

// Returns the email of the currently signed-in user. Falls back to the
// CURRENT_USER_EMAIL env var only for unauthenticated server contexts
// (e.g. cron handlers that need to attribute activity_log writes).
export async function getCurrentUserEmail(): Promise<string> {
  const session = await getCurrentSession();
  if (session) return session.email;
  return process.env.CURRENT_USER_EMAIL ?? "system";
}
