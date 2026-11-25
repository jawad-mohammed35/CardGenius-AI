"use client";

import { createClient } from "@supabase/supabase-js";
import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { changeVerifiedPassword, minPasswordLength, passwordRules, validatePasswordChange } from "../../../lib/password-change";
import { browserSupabase } from "../../../lib/supabase/browser";
import { supabasePublicKey, supabaseUrl } from "../../../lib/supabase/config";
import styles from "./account.module.css";

export function PasswordChangeForm({ userId, disabled }: { userId: string; disabled: boolean }) {
  const rulesId = useId();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const current = String(fields.get("current") ?? "");
    const password = String(fields.get("new") ?? "");
    const validation = validatePasswordChange(current, password, String(fields.get("confirm") ?? ""));
    if (validation) { setFeedback({ message: validation, error: true }); return; }

    setPending(true);
    setFeedback(null);
    try {
      const browser = browserSupabase();
      const verification = createClient(supabaseUrl, supabasePublicKey, {
        auth: { storageKey: "cardgenius-password-verification", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const failure = await changeVerifiedPassword(browser.auth, verification.auth, userId, current, password);
      if (failure) setFeedback({ message: failure, error: true });
      else { form.reset(); setFeedback({ message: "Password updated.", error: false }); }
    } catch {
      setFeedback({ message: "Couldn’t update your password. Try again.", error: true });
    } finally {
      setPending(false);
    }
  }

  return <form className={styles.settingsStack} onSubmit={changePassword}>
    <h3>Change password</h3>
    <PasswordField label="Current password" name="current" autoComplete="current-password" disabled={pending || disabled} />
    <PasswordField label="New password" name="new" autoComplete="new-password" rulesId={rulesId} disabled={pending || disabled} />
    <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" disabled={pending || disabled} />
    <p id={rulesId} className={styles.helpText}>{passwordRules}</p>
    {feedback?.error && <p className="form-error" role="alert">{feedback.message}</p>}
    <p role="status">{feedback?.error === false ? feedback.message : ""}</p>
    <div><button type="submit" className="secondary-button" disabled={pending || disabled}>{pending ? "Updating…" : "Change password"}</button></div>
  </form>;
}

function PasswordField({ label, name, autoComplete, rulesId, disabled }: {
  label: string; name: string; autoComplete: "current-password" | "new-password"; rulesId?: string; disabled: boolean;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return <div className={`${styles.settingsField} ${styles.settingsPassword}`}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordField}>
      <input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete}
        minLength={autoComplete === "new-password" ? minPasswordLength : undefined} maxLength={128}
        aria-describedby={rulesId} required disabled={disabled} />
      <button type="button" className={styles.visibilityButton} aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
        aria-controls={id} onClick={() => setVisible((wasVisible) => !wasVisible)} disabled={disabled}>
        <Icon size={18} aria-hidden="true" />
      </button>
    </div>
  </div>;
}
