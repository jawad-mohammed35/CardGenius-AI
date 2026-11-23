"use client";

import { Check, Monitor, Moon, Sun, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useCloudAccount } from "../lib/cloud-account";
import { accentKey, accents, themeKey, themes, type Theme } from "../lib/appearance";

const changeEvent = "cardgenius-appearance";
let transitionFrame = 0;
const themeOptions = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "oled", label: "OLED Black", icon: Monitor },
] as const;

function applyPreference(key: "theme" | "accent", value: string) {
  const root = document.documentElement;
  root.dataset.appearanceChanging = "";
  root.dataset[key] = value;
  cancelAnimationFrame(transitionFrame);
  transitionFrame = requestAnimationFrame(() => {
    transitionFrame = requestAnimationFrame(() => { delete root.dataset.appearanceChanging; });
  });
}

function subscribe(callback: () => void) {
  function sync(event: StorageEvent) {
    const { key, newValue } = event;
    if (key === themeKey || key === null) applyPreference("theme", themes.find((theme) => theme === newValue) ?? "light");
    if (key === accentKey || key === null) applyPreference("accent", accents.find(({ id }) => id === newValue)?.id ?? "monochrome");
    callback();
  }

  window.addEventListener(changeEvent, callback);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener(changeEvent, callback);
    window.removeEventListener("storage", sync);
  };
}

function getSnapshot() {
  const { theme = "light", accent = "monochrome" } = document.documentElement.dataset;
  return theme + ":" + accent;
}

function useAppearance() {
  return useSyncExternalStore(subscribe, getSnapshot, () => "light:monochrome").split(":");
}

function setPreference(key: "theme" | "accent", value: string) {
  applyPreference(key, value);
  try { localStorage.setItem(key === "theme" ? themeKey : accentKey, value); } catch {
    // The current page can still apply the preference.
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function AppearanceFields() {
  const group = useId();
  const [theme, accent] = useAppearance();
  const { user, saveProfile } = useCloudAccount();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");

  async function choose(key: "theme" | "accent", value: string) {
    if (!user) { setPreference(key, value); return; }
    setPending(true); setFailure("");
    try { await saveProfile({ [key]: value }); }
    catch { setFailure("Couldn’t sync your appearance. Try again."); }
    finally { setPending(false); }
  }
  return (
    <div className="appearance-fields">
      <fieldset disabled={pending}>
        <legend>Theme</legend>
        <div className="theme-options">
          {themeOptions.map(({ id, label, icon: Icon }) => (
            <label key={id}>
              <input type="radio" name={group + "-theme"} value={id} checked={theme === id} onChange={() => void choose("theme", id)} />
              <Icon size={16} aria-hidden="true" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={pending}>
        <legend>Accent color</legend>
        <div className="accent-options">
          {accents.map(({ id, label, light, dark }) => (
            <label key={id}>
              <input type="radio" name={group + "-accent"} value={id} checked={accent === id} onChange={() => void choose("accent", id)} />
              <span className="accent-swatch" style={{ backgroundColor: theme === "oled" && id === "monochrome" ? "#fff" : theme === "light" ? light : dark }}>
                {accent === id && <Check size={17} aria-hidden="true" />}
              </span>
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
    </div>
  );
}

export function AppearanceControl() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [theme] = useAppearance();
  const { user, profile, profileReady, ready } = useCloudAccount();
  useEffect(() => {
    if (!ready || !profileReady) return;
    let selectedTheme = profile?.theme;
    let selectedAccent = profile?.accent;
    try {
      selectedTheme ??= localStorage.getItem(themeKey);
      selectedAccent ??= localStorage.getItem(accentKey);
    } catch { /* Default colors remain available. */ }
    applyPreference("theme", themes.find((value) => value === selectedTheme) ?? "light");
    applyPreference("accent", accents.find(({ id }) => id === selectedAccent)?.id ?? "monochrome");
    window.dispatchEvent(new Event(changeEvent));
  }, [user?.id, ready, profileReady, profile?.theme, profile?.accent]);
  const Icon = themeOptions.find(({ id }) => id === theme as Theme)?.icon ?? Sun;
  return (
    <div className="appearance-control">
      <button type="button" className="appearance-trigger" aria-label="Appearance settings" title="Appearance settings" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <Icon size={19} aria-hidden="true" />
      </button>
      <dialog ref={dialog} className="appearance-dialog" aria-labelledby="appearance-title"
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="appearance-content">
          <header>
            <h2 id="appearance-title">Appearance</h2>
            <button type="button" className="icon-button" aria-label="Close appearance" onClick={() => dialog.current?.close()}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <AppearanceFields />
        </div>
      </dialog>
    </div>
  );
}
