"use client";

import { X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type FormEvent, type ReactNode } from "react";
import styles from "./deck-dialog.module.css";

export function DeckDialog({
  title, children, onClose, onSubmit, submitLabel, pending, error, destructive, submitDisabled,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void | false;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  pending: boolean;
  error?: string;
  destructive?: boolean;
  submitDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function dismiss() {
    if (onClose() !== false) ref.current?.close();
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={headingId} onCancel={(event) => {
      event.preventDefault();
      if (!pending) dismiss();
    }}>
      <div className={styles.dialogHeader}>
        <h2 id={headingId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={dismiss} disabled={pending}>
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <form className={styles.fields} onSubmit={onSubmit}>
        {children}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.dialogActions}>
          <button type="button" className="secondary-button" onClick={dismiss} disabled={pending}>Cancel</button>
          <button type="submit" className={destructive ? styles.dangerButton : "primary-button"} disabled={pending || submitDisabled}>
            {pending ? "Working…" : submitLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
