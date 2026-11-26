"use client";

import { Database, Palette, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { previewKey, useStoredText, writeStoredText } from "../../../lib/browser-settings";
import { clearLibrary, countLocalDecks, exportLibrary, importLibrary, migrateLocalDecks, type DeckScope } from "../../../lib/deck-storage";
import { useCloudAccount } from "../../../lib/cloud-account";
import { avatarColors, avatarIcons, prepareAvatar, useUserProfile, type LocalProfile } from "../../../lib/profile";
import { browserSupabase } from "../../../lib/supabase/browser";
import { useDeckLibrary } from "../../../lib/use-deck-library";
import { AppearanceFields } from "../../appearance-control";
import { DeckDialog } from "../deck-dialog";
import { PasswordChangeForm } from "./password-change-form";
import { ProfileAvatar } from "./profile-avatar";
import { StudySettings } from "./study-settings";
import styles from "./account.module.css";

const sections = [
  { label: "Profile", icon: UserRound },
  { label: "Appearance", icon: Palette },
  { label: "Study preferences", icon: SlidersHorizontal },
  { label: "My data", icon: Database },
  { label: "Account & security", icon: ShieldCheck },
] as const;

export function AccountPreview({ settings = false }: { settings?: boolean }) {
  const { ready, user, profileReady } = useCloudAccount();
  const scope = user ? `cloud:${user.id}` as const : null;
  const [section, setSection] = useState<(typeof sections)[number]["label"]>("Profile");
  const heading = useRef<HTMLHeadingElement>(null);
  if (!scope || !user) return <p role="status">{ready ? "Your session has ended. " : "Loading your account…"}{ready && <Link href="/sign-in">Sign in</Link>}</p>;
  if (!profileReady) return <p role="status">Loading your profile…</p>;
  return (
    <div className={styles.settingsArea}>
      <header className={styles.pageHeading}>
        <h1>{settings ? "Account settings" : "Account"}</h1>
        <p>Manage your profile, study preferences, and cloud library.</p>
      </header>
      <LocalDeckImport key={scope} scope={scope} />
      <div className={styles.settingsGrid}>
        <nav aria-label="Account settings" className={styles.settingsNav}>
          {sections.map(({ label, icon: Icon }) => (
            <button type="button" key={label} aria-current={section === label ? "true" : undefined}
              onClick={() => { setSection(label); requestAnimationFrame(() => heading.current?.focus()); }}>
              <Icon size={17} aria-hidden="true" />{label}
            </button>
          ))}
        </nav>
        <section className={"panel " + styles.settingsContent} aria-labelledby="settings-heading">
          <h2 id="settings-heading" tabIndex={-1} ref={heading}>{section}</h2>
          {section === "Profile" && <ProfileEditor key={user.id} />}
          {section === "Appearance" && <><p>Choose the theme and accent color for your account.</p><AppearanceFields /></>}
          {section === "Study preferences" && <StudySettings key={scope} scope={scope} />}
          {section === "My data" && <DataSettings key={scope} scope={scope} />}
          {section === "Account & security" && <SecuritySettings />}
        </section>
      </div>
    </div>
  );
}

function ProfileEditor() {
  const current = useUserProfile();
  const { saveProfile, user } = useCloudAccount();
  const [draft, setDraft] = useState<LocalProfile>(current);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const iconGroup = "profile-avatar-icon";
  const colorGroup = "profile-avatar-color";

  async function chooseAvatar(image: File) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const picture = await prepareAvatar(image);
      setDraft((previous) => ({ ...previous, image: picture }));
    } catch (error) { setError(error instanceof Error ? error.message : "Choose a different image."); }
    finally { setLoading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) { setError("Enter a display name."); return; }
    setSaving(true); setError("");
    try {
      await saveProfile({ display_name: name, avatar_icon: draft.icon, avatar_color: draft.color, avatar_image: draft.image ?? null,
        hide_provider_avatar: !draft.providerImage });
      setDraft({ ...draft, name });
      setNotice("Profile saved.");
    } catch { setError("Couldn’t save your profile. Try again."); }
    finally { setSaving(false); }
  }

  return (
    <form className={styles.settingsStack} onSubmit={save} noValidate>
      <div className={styles.settingsProfile}>
        <ProfileAvatar profile={draft} size={66} />
        <div><h3>{current.name}</h3><p>{user?.email}</p></div>
      </div>
      <label className={styles.settingsField}>Display name
        <input maxLength={48} required value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setNotice(""); }} />
      </label>
      <fieldset disabled={loading} className={styles.settingsStack}>
        <legend>Profile picture</legend>
        <div className={styles.actions}>
          <input type="file" accept="image/jpeg,image/png,image/webp" ref={file} hidden
            onChange={(event) => { const image = event.target.files?.[0]; if (image) void chooseAvatar(image); event.target.value = ""; }} />
          <button type="button" className="secondary-button" onClick={() => file.current?.click()}>{draft.image || draft.providerImage ? "Replace picture" : "Upload picture"}</button>
          {(draft.image || draft.providerImage) && <button type="button" className="text-button" onClick={() => setDraft({ ...draft, image: undefined, providerImage: undefined })}>Remove picture</button>}
        </div>
        <p>{loading ? "Preparing your preview…" : "PNG, JPEG, or WebP up to 5 MB. Photos are center-cropped to fit the circle."}</p>
      </fieldset>
      <fieldset className={styles.settingsStack}>
        <legend>Preset icon</legend>
        <div className={styles.avatarChoices}>
          {avatarIcons.map((icon) => (
            <label key={icon} title={icon}>
              <input type="radio" name={iconGroup} aria-label={icon} checked={draft.icon === icon && !draft.image && !draft.providerImage}
                onChange={() => { setDraft({ ...draft, icon, image: undefined, providerImage: undefined }); setNotice(""); }} />
              <ProfileAvatar profile={{ ...draft, icon, image: undefined, providerImage: undefined }} size={35} />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.settingsStack}>
        <legend>Avatar background</legend>
        <div className={styles.colorChoices}>
          {avatarColors.map(({ id, label, value }) => (
            <label key={id} title={label}>
              <input type="radio" name={colorGroup} aria-label={label} checked={draft.color === id}
                onChange={() => { setDraft({ ...draft, color: id }); setNotice(""); }} />
              <span style={{ backgroundColor: value }} />
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className={styles.actions}><button type="submit" className="primary-button" disabled={loading || saving}>Save profile</button><p role="status">{notice}</p></div>
    </form>
  );
}

function DataSettings({ scope }: { scope: DeckScope }) {
  const { data, failed } = useDeckLibrary(scope);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);

  function download() {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([exportLibrary(data)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "cardgenius-decks.json";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restore(backup: File) {
    setPending(true); setNotice(""); setError("");
    try {
      if (backup.size > 25_000_000) throw new Error("Choose a JSON backup up to 25 MB.");
      const count = await importLibrary(scope, await backup.text());
      setNotice(count ? "Imported " + count + " deck" + (count === 1 ? "." : "s.") : "This backup contains no decks.");
    } catch (error) { setError(error instanceof Error ? error.message : "Couldn’t import this backup."); }
    finally { setPending(false); }
  }

  async function clear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(""); setNotice("");
    try {
      await clearLibrary(scope);
      writeStoredText(previewKey(scope), null);
      setConfirm(false);
      setNotice("Local data cleared.");
    } catch { setError("Couldn’t clear the library. Try again."); }
    finally { setPending(false); }
  }

  return (
    <div className={styles.settingsStack}>
      <p>Your saved decks sync to your account. Export copies to keep a separate backup.</p>
      {failed ? <p role="alert">Browser storage is unavailable.</p> : data ? (
        <div className={styles.dataCounts}>
          <div><strong>{data.decks.length}</strong> Saved decks</div>
          <div><strong>{data.decks.reduce((total, deck) => total + deck.flashcards.length, 0)}</strong> Flashcards</div>
        </div>
      ) : <p role="status">Loading your library…</p>}
      <p>A JSON backup includes deck content and folder assignments. Imported decks are added as copies.</p>
      <div className={styles.actions}>
        <button type="button" className="secondary-button" disabled={!data?.decks.length || pending} onClick={download}>Export saved decks</button>
        <input type="file" accept=".json,application/json" ref={file} hidden onChange={(event) => {
          const backup = event.target.files?.[0];
          if (backup) void restore(backup);
          event.target.value = "";
        }} />
        <button type="button" className="secondary-button" disabled={!data || pending} onClick={() => file.current?.click()}>Import decks</button>
      </div>
      <button type="button" className={styles.clearData} disabled={!data || pending} onClick={() => { setError(""); setConfirm(true); }}>Clear cloud library</button>
      {!confirm && error && <p role="alert" className="form-error">{error}</p>}
      <p role="status">{notice}</p>
      {confirm && (
        <DeckDialog title="Clear cloud library?" destructive submitLabel="Clear cloud library" pending={pending}
          error={error} onSubmit={clear} onClose={() => { setError(""); setConfirm(false); }}>
          <p>This permanently deletes the decks and folders saved to this account, including their study progress.</p>
        </DeckDialog>
      )}
    </div>
  );
}

function LocalDeckImport({ scope }: { scope: `cloud:${string}` }) {
  const key = "cardgenius:imported:" + scope;
  const imported = useStoredText(key);
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void countLocalDecks().then((total) => { if (active) setCount(total); }, () => {});
    return () => { active = false; };
  }, []);

  if (!message && (imported || !count)) return null;
  return <div className={styles.previewNotice}>
    {message ? <p role="status">{message}</p> : <p>{count} {count === 1 ? "deck is" : "decks are"} saved in this browser. Import them into this account.</p>}
    {!imported && count > 0 && <button type="button" className="secondary-button" disabled={pending} onClick={async () => {
      setPending(true);
      try {
        const total = await migrateLocalDecks(scope);
        writeStoredText(key, "yes");
        setMessage(total ? `Imported ${total} ${total === 1 ? "deck" : "decks"}. The originals stay in this browser.` : "These decks are already in your account.");
      } catch { setMessage("Import was interrupted. Try again to pick up where it stopped."); }
      finally { setPending(false); }
    }}>{pending ? "Importing…" : "Import browser decks"}</button>}
  </div>;
}

function SecuritySettings() {
  const { user } = useCloudAccount();
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const hasPassword = user?.identities?.some((identity) => identity.provider === "email") ?? false;

  async function signOut() {
    setPending(true);
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      window.location.assign("/");
    } catch { setError("Couldn’t sign out. Try again."); setPending(false); }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (new FormData(event.currentTarget).get("confirmation") !== "DELETE") {
      setError("Type DELETE to confirm."); return;
    }
    setPending(true); setError("");
    try {
      const client = browserSupabase();
      const current = await client.auth.getUser();
      if (current.error || current.data.user?.id !== user?.id) throw new Error();
      const result = await client.rpc("cg_delete_account");
      if (result.error) throw result.error;
      if (user) writeStoredText(previewKey(`cloud:${user.id}`), null);
      await client.auth.signOut({ scope: "local" });
      window.location.assign("/");
    } catch { setError("Couldn’t delete your account. Try again."); setPending(false); }
  }

  return <div className={styles.settingsStack}>
    <p>{user?.email} · {hasPassword ? "Email account" : "Google account"}</p>
    {hasPassword && user && <PasswordChangeForm key={user.id} userId={user.id} disabled={pending} />}
    {!deleting && error && <p role="alert" className="form-error">{error}</p>}
    <div className={styles.actions}><button type="button" className="secondary-button" disabled={pending} onClick={signOut}>Sign out</button>
      <Link className="secondary-button" href="/privacy">Privacy Policy</Link></div>
    <button type="button" className={styles.clearData} disabled={pending} onClick={() => { setError(""); setDeleting(true); }}>Delete account</button>
    {deleting && <DeckDialog title="Delete your account?" submitLabel="Delete account" pending={pending} error={error} destructive
      onClose={() => { setDeleting(false); setError(""); }} onSubmit={deleteAccount}>
      <p>This permanently deletes your account, decks, profile, and study progress from CardGeniusAI.</p>
      <label className={styles.settingsField}>Type DELETE<input name="confirmation" autoComplete="off" required /></label>
    </DeckDialog>}
  </div>;
}
