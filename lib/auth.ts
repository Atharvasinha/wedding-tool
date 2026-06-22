// No real auth — wedding tool runs unprotected on its Vercel URL by design.
// This stub exists so activity_log writes can attribute mutations to a "user".
export async function getCurrentUserEmail(): Promise<string> {
  return process.env.CURRENT_USER_EMAIL ?? "atharva.r.sinha@gmail.com";
}
