// Phase 1: there is no real auth. Mutations attribute all activity to the
// hardcoded current user. Real magic-link auth lands in Phase 5.
export function getCurrentUserEmail(): string {
  return process.env.CURRENT_USER_EMAIL ?? "atharva.r.sinha@gmail.com";
}
