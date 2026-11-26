"use client";

import { Volume2 } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { useStudyPreferences, type StudyPreferences } from "../../../lib/browser-settings";
import { useCloudAccount } from "../../../lib/cloud-account";
import type { DeckScope } from "../../../lib/deck-storage";
import { difficultyOptions, maxCardCount } from "../../../lib/flashcards";
import { playRatingSound } from "../../../lib/study-audio";
import { defaultBindings, restoreBinding, shortcutFromEvent, shortcutLabel, studyActionIds, studyActions, type StudyAction } from "../../../lib/study-shortcuts";
import { AccentSelect } from "../accent-select";
import { ShortcutKey } from "../study-shortcuts";
import styles from "./account.module.css";

const sides = [{ value: "question", label: "Question" }, { value: "answer", label: "Answer" }] as const;
const behavior = [
  ["advance", "Advance after rating a card"],
  ["confirmRestart", "Confirm before restarting a session"],
  ["shuffleOnStart", "Shuffle cards when starting a new session"],
] as const;
const display = [
  ["animate", "Animate card flips and transitions"],
  ["showHints", "Show keyboard hints beside study controls"],
] as const;

function profileFields(prefs: StudyPreferences) {
  return {
    difficulty: prefs.difficulty, card_count: prefs.count, auto_advance: prefs.advance, animate_cards: prefs.animate,
    confirm_restart: prefs.confirmRestart, shuffle_on_start: prefs.shuffleOnStart, starting_side: prefs.startingSide,
    show_keyboard_hints: prefs.showHints, study_sounds: prefs.sounds, study_volume: prefs.volume, study_shortcuts: prefs.shortcuts,
  };
}

export function StudySettings({ scope }: { scope: DeckScope }) {
  const { saveProfile } = useCloudAccount();
  const preferences = useStudyPreferences(scope);
  const [baseline, setBaseline] = useState(preferences);
  const [draft, setDraft] = useState(preferences);
  const [capture, setCapture] = useState<StudyAction | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const volumeId = useId();

  function patch(values: Partial<StudyPreferences>) {
    setDraft((current) => ({ ...current, ...values }));
    setNotice("");
    setError("");
  }

  function captureKey(event: KeyboardEvent<HTMLButtonElement>, action: StudyAction) {
    if (capture !== action || event.key === "Tab") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setCapture(null); setShortcutError(""); return; }
    if (event.repeat || ["Shift", "Control", "Meta", "Alt"].includes(event.key)) return;
    const key = shortcutFromEvent(event.nativeEvent);
    if (!key) { setShortcutError("Use a letter, number, arrow, Space, or Shift with a letter or number."); return; }
    const conflict = studyActionIds.find((id) => id !== action && draft.shortcuts[id] === key);
    if (conflict) { setShortcutError(`${shortcutLabel(key)} is already assigned to ${studyActions[conflict].label}.`); return; }
    patch({ shortcuts: { ...draft.shortcuts, [action]: key } });
    setShortcutError("");
    setCapture(null);
  }

  function toggles(options: readonly (readonly [keyof Pick<StudyPreferences, "advance" | "confirmRestart" | "shuffleOnStart" | "animate" | "showHints">, string])[]) {
    return options.map(([id, label]) => <label key={id} className={styles.flag}>
      <input type="checkbox" checked={draft[id]} onChange={(event) => patch({ [id]: event.target.checked })} /> {label}
    </label>);
  }

  return <form className={styles.settingsStack} onSubmit={async (event) => {
    event.preventDefault();
    if (saving) return;
    const fields = profileFields(draft);
    const previous = profileFields(baseline);
    const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) =>
      JSON.stringify(value) !== JSON.stringify(previous[key as keyof typeof previous])));
    setSaving(true);
    setError("");
    try {
      if (Object.keys(changes).length) await saveProfile(changes);
      setBaseline(draft);
      setNotice("Study preferences saved.");
    } catch { setError("Couldn’t save your study preferences. Try again."); }
    finally { setSaving(false); }
  }}>
    <fieldset className={styles.studyGroup} disabled={saving}>
      <legend>Deck generation</legend>
      <div className={styles.settingsFields}>
        <div className={styles.settingsField}>
          <AccentSelect label="Default difficulty" value={draft.difficulty} onChange={(difficulty) => patch({ difficulty })} options={difficultyOptions} />
        </div>
        <label className={styles.settingsField}>Default deck size
          <input type="number" min={1} max={maxCardCount} required value={draft.count || ""} onChange={(event) => patch({ count: Number(event.target.value) })} />
        </label>
      </div>
    </fieldset>
    <fieldset className={styles.studyGroup} disabled={saving}>
      <legend>Study behavior</legend>
      {toggles(behavior)}
      <p>Saved sessions resume with their current card order and progress.</p>
    </fieldset>
    <fieldset className={styles.studyGroup} disabled={saving}>
      <legend>Display</legend>
      <div className={styles.settingsField}>
        <AccentSelect label="Starting card side" value={draft.startingSide} onChange={(startingSide) => patch({ startingSide })} options={sides} />
      </div>
      {toggles(display)}
    </fieldset>
    <fieldset className={styles.studyGroup} disabled={saving}>
      <legend>Sound &amp; feedback</legend>
      <label className={styles.flag}><input type="checkbox" checked={draft.sounds}
        onChange={(event) => patch({ sounds: event.target.checked })} /> Play rating sounds</label>
      <div className={styles.volume}>
        <label htmlFor={volumeId}>Study sound volume</label><output htmlFor={volumeId}>{draft.volume}%</output>
        <input id={volumeId} type="range" min={0} max={100} value={draft.volume}
          aria-valuetext={`${draft.volume} percent`} onChange={(event) => patch({ volume: Number(event.target.value) })} />
      </div>
      <div className={styles.actions}>
        <button type="button" className="secondary-button" onClick={() => void playRatingSound("known", draft.volume)}><Volume2 size={16} aria-hidden="true" /> Preview Known</button>
        <button type="button" className="secondary-button" onClick={() => void playRatingSound("review", draft.volume)}><Volume2 size={16} aria-hidden="true" /> Preview Needs Review</button>
      </div>
    </fieldset>
    <fieldset className={styles.studyGroup} disabled={saving}>
      <legend>Keyboard controls</legend>
      <p>Select a shortcut and press a key or Shift with a letter or number. Esc cancels recording and always exits fullscreen.</p>
      <ul className={styles.shortcutRows}>
        {studyActionIds.map((action) => <li key={action}>
          <span>{studyActions[action].label}</span>
          <button type="button" className="secondary-button" aria-pressed={capture === action}
            aria-label={`Change ${studyActions[action].label} shortcut, current key ${shortcutLabel(draft.shortcuts[action])}`}
            onClick={() => { setCapture(capture === action ? null : action); setShortcutError(""); }}
            onBlur={() => { if (capture === action) { setCapture(null); setShortcutError(""); } }}
            onKeyDown={(event) => captureKey(event, action)}>
            {capture === action ? "Press a key…" : <ShortcutKey binding={draft.shortcuts[action]} />}
          </button>
          <button type="button" className="text-button" aria-label={`Reset ${studyActions[action].label} shortcut`}
            disabled={draft.shortcuts[action] === defaultBindings[action]} onClick={() => {
              patch({ shortcuts: restoreBinding(draft.shortcuts, action) });
              setShortcutError("");
            }}>Reset</button>
        </li>)}
      </ul>
      {shortcutError && <p className="form-error" role="alert">{shortcutError}</p>}
      <button type="button" className="secondary-button" onClick={() => {
        patch({ shortcuts: defaultBindings });
        setShortcutError("");
      }}>Reset all shortcuts</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className={styles.actions}>
      <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save study preferences"}</button>
      <p role="status">{notice}</p>
    </div>
  </form>;
}
