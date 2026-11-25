import type { SupabaseClient } from "@supabase/supabase-js";

type Auth = SupabaseClient["auth"];
export type AccountSession = Pick<Auth, "getUser" | "getSession" | "setSession">;
export type PasswordVerification = Pick<Auth, "signInWithPassword" | "updateUser" | "signOut">;

export const minPasswordLength = 10;
export const passwordRules = "Use at least 10 characters (up to 72 bytes) and choose a different password.";

export function validatePasswordChange(current: string, password: string, confirmation: string) {
  if (!current) return "Enter your current password.";
  if (password.length < minPasswordLength || new TextEncoder().encode(password).length > 72 || password === current) {
    return passwordRules;
  }
  return password !== confirmation ? "The new passwords don’t match." : null;
}

export async function changeVerifiedPassword(
  browser: AccountSession, verification: PasswordVerification, userId: string, current: string, password: string,
) {
  let adopted = false;
  let updated = false;
  try {
    const { data: { user }, error: sessionError } = await browser.getUser();
    if (sessionError || user?.id !== userId || !user.email || !user.identities?.some(({ provider }) => provider === "email")) {
      return "Sign in again with your email account to change your password.";
    }
    // Verify in an isolated session so a failed check cannot replace the existing browser session.
    const { data: signedIn, error: signInError } = await verification.signInWithPassword({ email: user.email, password: current });
    if (signInError || signedIn.user?.id !== userId || !signedIn.session) {
      return signInError?.code === "invalid_credentials" ? "The current password is incorrect." : "Couldn’t verify your password. Try again.";
    }
    const { error } = await verification.updateUser({ password, current_password: current });
    if (error) {
      if (error.code === "weak_password") return "Choose a stronger password with more variety.";
      if (error.code === "same_password") return "Choose a password different from your current password.";
      return "Couldn’t update your password. Try again.";
    }
    updated = true;
    // Carry the fresh session forward only if the browser is still using the verified account.
    const { data: { session } } = await browser.getSession();
    if (session?.user.id === userId) {
      const { access_token, refresh_token } = signedIn.session;
      adopted = !(await browser.setSession({ access_token, refresh_token })).error;
    }
    return null;
  } catch {
    return updated ? null : "Couldn’t update your password. Try again.";
  } finally {
    if (!adopted) await verification.signOut({ scope: "local" }).catch(() => {});
  }
}
