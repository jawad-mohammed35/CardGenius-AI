"use client";

import { Keyboard, X } from "lucide-react";
import { useId, useRef } from "react";
import { shortcutLabel, studyActionIds, studyActions, type StudyBindings } from "../../lib/study-shortcuts";
import styles from "../deck-view.module.css";

export function ShortcutKey({ binding, hint = false }: { binding: string; hint?: boolean }) {
  return <kbd className={hint ? styles.hint : styles.keycap} aria-hidden={hint || undefined}>{shortcutLabel(binding)}</kbd>;
}

export function StudyShortcuts({ bindings, exportEnabled = true }: { bindings: StudyBindings; exportEnabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  return (
    <>
      <button type="button" className="icon-button"
        aria-label="Keyboard shortcuts" title="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <Keyboard size={17} aria-hidden="true" />
      </button>
      <dialog ref={dialog} aria-labelledby={heading} className={styles.shortcuts}>
        <header>
          <h2 id={heading}>Keyboard shortcuts</h2>
          <button type="button" className="icon-button" aria-label="Close shortcuts" onClick={() => dialog.current?.close()}><X size={17} aria-hidden="true" /></button>
        </header>
        <p>Focus the study area to use these controls.</p>
        <dl>{studyActionIds.filter((id) => exportEnabled || id !== "copy").map((id) => (
          <div key={id}><dt><ShortcutKey binding={bindings[id]} /></dt><dd>{studyActions[id].label}</dd></div>
        ))}<div><dt><ShortcutKey binding="Escape" /></dt><dd>Close the active dialog or exit fullscreen</dd></div></dl>
      </dialog>
    </>
  );
}
