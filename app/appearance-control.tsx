"use client";

import { Check, Moon, MoonStar, Sun } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useCloudAccount } from "../lib/cloud-account";
import { accentKey, accents, themeKey, themes, type Accent, type Theme } from "../lib/appearance";

const changeEvent = "cardgenius-appearance";
let transitionFrame = 0;
const themeOptions = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "oled", label: "Midnight", icon: MoonStar },
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
  const [theme, accent] = useSyncExternalStore(subscribe, getSnapshot, () => "light:monochrome").split(":");
  return { theme: themes.find((value) => value === theme) ?? "light", accent: accents.find(({ id }) => id === accent)?.id ?? "monochrome" };
}

function setPreference(key: "theme" | "accent", value: string) {
  applyPreference(key, value);
  try { localStorage.setItem(key === "theme" ? themeKey : accentKey, value); } catch {
    // The current page can still apply the preference.
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function AppearanceChoices({ theme, accent, disabled, onTheme, onAccent }: {
  theme: Theme; accent: Accent; disabled?: boolean; onTheme: (theme: Theme) => void; onAccent: (accent: Accent) => void;
}) {
  const group = useId();
  return (
    <div className="appearance-fields">
      <fieldset disabled={disabled}>
        <legend>Theme</legend>
        <div className="theme-options">
          {themeOptions.map(({ id, label, icon: Icon }) => (
            <label key={id}>
              <input type="radio" name={group + "-theme"} value={id} checked={theme === id} onChange={() => onTheme(id)} />
              <Icon size={16} aria-hidden="true" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>Accent color</legend>
        <div className="accent-options">
          {accents.map(({ id, label, light, dark }) => (
            <label key={id} title={label}>
              <input type="radio" name={group + "-accent"} value={id} aria-label={label} checked={accent === id} onChange={() => onAccent(id)} />
              <span className="accent-swatch" style={{ backgroundColor: theme === "oled" && id === "monochrome" ? "#fff" : theme === "light" ? light : dark }}>
                {accent === id && <Check size={16} aria-hidden="true" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function AppearanceFields() {
  const { theme, accent } = useAppearance();
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
    <>
      <AppearanceChoices theme={theme} accent={accent} disabled={pending}
        onTheme={(value) => void choose("theme", value)} onAccent={(value) => void choose("accent", value)} />
      {failure && <p role="alert">{failure}</p>}
    </>
  );
}

export function AppearanceControl() {
  const id = useId();
  const { theme } = useAppearance();
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
  const Icon = themeOptions.find(({ id }) => id === theme)?.icon ?? Sun;
  return (
    <div className="appearance-control">
      <button type="button" className="appearance-trigger" aria-label="Appearance settings" title="Appearance settings" aria-haspopup="dialog" popoverTarget={id}>
        <Icon size={19} aria-hidden="true" />
      </button>
      <div id={id} popover="auto" role="dialog" className="appearance-popover" aria-labelledby={id + "-title"}>
        <h2 id={id + "-title"}>Appearance</h2>
        <AppearanceFields />
      </div>
    </div>
  );
}
