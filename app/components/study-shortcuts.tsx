"use client";

import { Keyboard, X } from "lucide-react";
import { useId, useRef } from "react";
import styles from "../deck-view.module.css";

const shortcuts = [
  ["← / →", "Previous or next card"],
  ["Space", "Flip the current card"],
  ["↑ / ↓", "Mark known or needs review"],
  ["C", "Copy the question and answer"],
  ["F", "Enter or exit fullscreen"],
  ["S", "Shuffle the cards"],
  ["R", "Restart the session"],
  ["Esc", "Close the active dialog or exit fullscreen"],
];

export function StudyShortcuts({ iconOnly = false, exportEnabled = true }: { iconOnly?: boolean; exportEnabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  return (
    <>
      <button type="button" className={iconOnly ? "icon-button" : "secondary-button"}
        aria-label="Keyboard shortcuts" title="Keyboard shortcuts" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        <Keyboard size={17} aria-hidden="true" />{!iconOnly && "Keyboard shortcuts"}
      </button>
      <dialog ref={dialog} aria-labelledby={heading} className={styles.shortcuts}>
        <header>
          <h2 id={heading}>Keyboard shortcuts</h2>
          <button type="button" className="icon-button" aria-label="Close shortcuts" onClick={() => dialog.current?.close()}><X size={17} aria-hidden="true" /></button>
        </header>
        <p>Focus the study area to use these controls.</p>
        <dl>{shortcuts.filter(([key]) => exportEnabled || key !== "C").map(([key, action]) => (
          <div key={key}><dt><kbd>{key}</kbd></dt><dd>{action}</dd></div>
        ))}</dl>
      </dialog>
    </>
  );
}
