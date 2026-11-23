"use client";

import { Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { safeAuthReturn } from "../../../lib/auth-paths";
import { browserSupabase } from "../../../lib/supabase/browser";
import { authConfigured } from "../../../lib/supabase/config";
import styles from "./account.module.css";

const copies = {
  "sign-in": ["Sign in", "Open your cloud library and pick up where you left off.", "Sign in"],
  "sign-up": ["Create your account", "Keep your decks and study progress across devices.", "Sign up"],
  reset: ["Forgot password", "Enter the email address you use for CardGeniusAI.", "Send reset link"],
  change: ["Set a new password", "Choose a password you haven’t used before.", "Update password"],
} as const;

export function AuthForm({ mode, expired = false }: { mode: keyof typeof copies; expired?: boolean }) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [heading, description, action] = copies[mode];
  const newPassword = mode === "sign-up" || mode === "change";
  const google = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "true";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authConfigured || pending) return;
    const fields = new FormData(event.currentTarget);
    const email = String(fields.get("email") ?? "").trim();
    const password = String(fields.get("password") ?? "");
    const name = String(fields.get("name") ?? "").trim();
    if (mode === "sign-up" && !name) { setError("Enter your name."); return; }
    if (newPassword && (password.length < 10 || new TextEncoder().encode(password).length > 72)) {
      setError("Use a password of at least 10 characters and at most 72 bytes."); return;
    }
    if (mode === "change" && password !== fields.get("confirm")) {
      setError("The passwords must match."); return;
    }
    setPending(true); setNotice(""); setError("");
    const callback = window.location.origin + "/auth/callback";
    try {
      const auth = browserSupabase().auth;
      if (mode === "sign-in") {
        const result = await auth.signInWithPassword({ email, password });
        if (result.error) { setError("We couldn’t sign you in. Check your password and verify your email first."); return; }
        window.location.assign(safeAuthReturn(new URL(window.location.href).searchParams.get("next")));
      } else if (mode === "sign-up") {
        const result = await auth.signUp({ email, password, options: { emailRedirectTo: callback, data: { full_name: name } } });
        if (result.error && !["user_already_exists", "email_exists"].includes(result.error.code ?? "")) {
          setError("We couldn’t send a verification email. Try again later."); return;
        }
        setNotice("If registration is available for that address, you’ll receive a verification email. If you already have an account, sign in or reset your password.");
      } else if (mode === "reset") {
        const result = await auth.resetPasswordForEmail(email, { redirectTo: callback + "?flow=recovery" });
        if (result.error && !["user_not_found", "email_address_not_authorized"].includes(result.error.code ?? "")) {
          setError("We couldn’t send the reset email. Try again later."); return;
        }
        setNotice("If that email is registered, you’ll receive a password reset link.");
      } else {
        const result = await auth.updateUser({ password });
        if (result.error) { setError("The password couldn’t be updated. Try a new recovery link."); return; }
        window.location.assign("/account");
      }
    } catch { setError("The authentication service is unavailable. Try again."); }
    finally { setPending(false); }
  }

  async function continueWithGoogle() {
    setError("");
    setPending(true);
    try {
      const callback = new URL("/auth/callback", window.location.origin);
      const result = await browserSupabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.href } });
      if (result.error) setError("Google sign-in is unavailable. Try again later.");
    } catch { setError("Google sign-in is unavailable. Try again later."); }
    finally { setPending(false); }
  }

  return (
    <div className={styles.accessLayout}>
      <section className={`panel ${styles.authPanel}`} aria-labelledby="access-title">
        <header className={styles.pageHeading}><h1 id="access-title">{heading}</h1><p>{description}</p></header>
        {!authConfigured && <p role="status">Sign-in setup is incomplete on this environment.</p>}
        {expired && <p role="alert" className="form-error">This sign-in or recovery link is invalid or expired. Request a new link or sign in again.</p>}
        <form className={styles.authForm} onSubmit={submit}>
          {mode === "sign-up" && <div className={styles.field}><label htmlFor="auth-name">Name</label><input id="auth-name" name="name" autoComplete="name" maxLength={48} required /></div>}
          {mode !== "change" && <div className={styles.field}>
            <label htmlFor="auth-email">Email address</label>
            <input id="auth-email" name="email" type="email" autoComplete="email" maxLength={254} required />
          </div>}
          {mode !== "reset" && <div className={styles.field}>
            <div className={styles.fieldLabel}><label htmlFor="auth-password">Password</label>
              {mode === "sign-in" && <Link className={styles.inlineLink} href="/forgot-password">Forgot password?</Link>}
            </div>
            <div className={styles.passwordField}>
              <input id="auth-password" name="password" type={show ? "text" : "password"} autoComplete={newPassword ? "new-password" : "current-password"} minLength={newPassword ? 10 : undefined} maxLength={128} required />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>
                {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {newPassword && <p>Use at least 10 characters.</p>}
          </div>}
          {mode === "change" && <div className={styles.field}><label htmlFor="auth-confirm">Confirm password</label>
            <input id="auth-confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" minLength={10} maxLength={128} required />
          </div>}
          {error && <p role="alert" className="form-error">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          <button type="submit" className="primary-button" disabled={!authConfigured || pending}>{pending ? "Working…" : action}</button>
        </form>
        {(mode === "sign-in" || mode === "sign-up") && (
          <button type="button" className={`secondary-button ${styles.googleButton}`} disabled={!authConfigured || !google || pending} onClick={continueWithGoogle}>
            <Image src="/google-g.png" alt="" width={18} height={18} /> Continue with Google
          </button>
        )}
        {(mode === "sign-in" || mode === "sign-up") && !google && <p className={styles.inlineLink}>Google sign-in will be available after the provider is configured.</p>}
        <p className={styles.switchLink}>{mode === "sign-in" ? <Link href="/sign-up">Create an account</Link> : <Link href="/sign-in">Back to sign in</Link>}</p>
      </section>
    </div>
  );
}
