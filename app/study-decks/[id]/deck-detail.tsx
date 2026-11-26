"use client";

import { BookOpen, ChevronLeft, Pencil, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AccentSelect } from "../../components/accent-select";
import { DeckDialog } from "../../components/deck-dialog";
import { DeckIcon } from "../../components/deck-icon";
import fields from "../../components/deck-dialog.module.css";
import { DeckView } from "../../deck-view";
import { getStoredDeck, saveStudySession, updateDeckCard, type DeckScope, type StoredDeck } from "../../../lib/deck-storage";
import { cardSchema, difficultyOptions } from "../../../lib/flashcards";
import { useDeckScope } from "../../../lib/use-deck-library";
import type { StudySession } from "../../../lib/study-session";
import styles from "../study-library.module.css";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export function DeckDetail({ id, editing }: { id: string; editing: boolean }) {
  const scope = useDeckScope();
  return <DeckDetailContent key={`${scope}:${id}`} scope={scope} id={id} editing={editing} />;
}

function DeckDetailContent({ id, scope, editing }: {
  id: string; scope: DeckScope; editing: boolean;
}) {
  const [snapshot, setSnapshot] = useState<{ deck?: StoredDeck; failed: boolean } | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const sessionWrites = useRef(Promise.resolve());
  const deck = snapshot?.deck;
  const href = `/study-decks/${id}`;

  useEffect(() => {
    let active = true;
    getStoredDeck(scope, id).then(
      (deck) => { if (active) setSnapshot({ deck, failed: false }); },
      () => { if (active) setSnapshot({ failed: true }); },
    );
    return () => { active = false; };
  }, [id, scope]);

  function onSessionChange(session: StudySession) {
    setSnapshot((previous) => previous?.deck ? { ...previous, deck: { ...previous.deck, session } } : previous);
    sessionWrites.current = sessionWrites.current.then(() => saveStudySession(scope, id, session)).then(
      (updated) => {
        setSessionError(false);
        setSnapshot((previous) => previous?.deck ? { ...previous, deck: { ...previous.deck, lastStudiedAt: updated.lastStudiedAt } } : previous);
      },
      () => setSessionError(true),
    );
  }

  return (
    <section className={styles.detail} aria-labelledby="saved-deck-title">
      <div className={styles.detailBody}>
        <Link href="/study-decks" className={styles.breadcrumb}><ChevronLeft size={17} aria-hidden="true" /> Study decks</Link>
        <header className={styles.pageHeader}>
          <div>
            <h1 id="saved-deck-title" className={styles.detailIdentity}>{deck && <DeckIcon appearance={deck.appearance} />}{deck?.title ?? "Study deck"}</h1>
            {deck && (
              <p>{[deck.subject, `${deck.flashcards.length} ${deck.flashcards.length === 1 ? "card" : "cards"}`,
                deck.lastStudiedAt ? `Last studied ${dateFormat.format(new Date(deck.lastStudiedAt))}` : ""].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          {deck && (editing ? (
            <Link href={href} className="primary-button"><BookOpen size={17} aria-hidden="true" /> Study deck</Link>
          ) : (
            <Link href={`${href}?view=edit`} className="secondary-button"><Pencil size={16} aria-hidden="true" /> Edit cards</Link>
          ))}
        </header>

        {deck ? (
          <div className={`panel ${styles.detailPanel}`}>
            {editing ? <CardEditor deck={deck} beforeSave={() => sessionWrites.current}
              onUpdate={(updated) => setSnapshot({ deck: updated, failed: false })} /> : (
              <DeckView deck={deck} identity={<DeckIcon appearance={deck.appearance} />} initialSession={deck.session} onSessionChange={onSessionChange} />
            )}
            {sessionError && <p className={styles.detailNotice} role="alert">This browser couldn’t save your study progress. Check site storage and try again.</p>}
          </div>
        ) : (
          <div className={`panel ${styles.empty}`} role={snapshot?.failed ? "alert" : "status"}>
            {snapshot?.failed ? "Browser storage is unavailable. Allow site storage, then reload."
              : snapshot ? "This deck isn’t available in the active library." : "Opening your deck…"}
          </div>
        )}
      </div>
    </section>
  );
}

function CardEditor({ deck, beforeSave, onUpdate }: { deck: StoredDeck; beforeSave: () => Promise<void>; onUpdate: (deck: StoredDeck) => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const editedButton = useRef<HTMLButtonElement>(null);
  const term = query.trim().toLocaleLowerCase();
  const matches = deck.flashcards.map((card, position) => ({ card, position }))
    .filter(({ card, position }) => !term || String(position + 1) === term ||
      [card.front, card.back].some((value) => value.toLocaleLowerCase().includes(term)));

  function closeEditor() {
    setIndex(null);
    requestAnimationFrame(() => (editedButton.current?.isConnected ? editedButton.current : search.current)?.focus({ preventScroll: true }));
  }

  return <section className={styles.editor} aria-labelledby="edit-card-heading">
    <header>
      <h2 id="edit-card-heading">Edit flashcards</h2>
      <p>Search by card number, question, or answer.</p>
    </header>
    <label className={`${fields.field} ${styles.search}`}>
      <span className="sr-only">Search flashcards</span><Search size={17} aria-hidden="true" />
      <input ref={search} type="search" placeholder="Search flashcards…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    <p className={notice ? styles.notice : "sr-only"} role="status">{notice}</p>
    {matches.length ? <ul className={styles.editorCards}>
      {matches.map(({ card, position }) => <li key={position}>
        <button className={styles.editCard} type="button" onClick={(event) => {
          editedButton.current = event.currentTarget;
          setNotice("");
          setIndex(position);
        }}>
          <span className="list-number">{position + 1}</span>
          <span><strong>{card.front}</strong><small>{card.back}</small></span>
          <span className={styles.editAction}><Pencil size={14} aria-hidden="true" /> Edit</span>
        </button>
      </li>)}
    </ul> : <p role="status">No matching flashcards.</p>}
    {index !== null && <EditCardDialog key={index} deck={deck} index={index} beforeSave={beforeSave} onClose={closeEditor}
      onSaved={(updated) => { onUpdate(updated); setNotice(`Card ${index + 1} saved.`); closeEditor(); }} />}
  </section>;
}

function EditCardDialog({ deck, index, beforeSave, onSaved, onClose }: {
  deck: StoredDeck; index: number; beforeSave: () => Promise<void>; onSaved: (deck: StoredDeck) => void; onClose: () => void;
}) {
  const card = deck.flashcards[index];
  const [values, setValues] = useState(card);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fieldId = useId();
  const dirty = card.front !== values.front || card.back !== values.back || card.difficulty !== values.difficulty;

  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = true; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    const checked = cardSchema.safeParse(values);
    if (!checked.success) { setError("Enter a question and an answer that fit the length limits."); return; }
    setError("");
    setPending(true);
    try {
      await beforeSave();
      const updated = await updateDeckCard(deck.scope, deck.id, index, { ...checked.data, difficulty: values.difficulty });
      onSaved(updated);
    } catch {
      setError("This card couldn’t be saved. Your edits are still here. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <DeckDialog title={`Edit card ${index + 1}`} submitLabel="Save card" pending={pending} error={error} submitDisabled={!dirty}
      onSubmit={submit} onClose={() => {
        if (dirty) { setConfirmDiscard(true); return false; }
        onClose();
      }}>
      <div className={fields.field}>
        <label htmlFor={`${fieldId}-question`}><span>Question</span></label>
        <textarea id={`${fieldId}-question`} rows={3} required maxLength={220} value={values.front} disabled={pending}
          onChange={(event) => setValues({ ...values, front: event.target.value })} />
      </div>
      <div className={fields.field}>
        <label htmlFor={`${fieldId}-answer`}><span>Answer</span></label>
        <textarea id={`${fieldId}-answer`} rows={4} required maxLength={480} value={values.back} disabled={pending}
          onChange={(event) => setValues({ ...values, back: event.target.value })} />
      </div>
      <div className={fields.field}>
        <AccentSelect label="Difficulty" value={values.difficulty} options={difficultyOptions} disabled={pending}
          onChange={(difficulty) => setValues({ ...values, difficulty })} />
      </div>
      {dirty && confirmDiscard && <div className={styles.discard}>
        <p role="alert">Discard the unsaved changes to this card?</p>
        <div>
          <button type="button" className="secondary-button" disabled={pending} onClick={() => setConfirmDiscard(false)}>Keep editing</button>
          <button type="button" className={fields.dangerButton} disabled={pending} onClick={onClose}>Discard edits</button>
        </div>
      </div>}
    </DeckDialog>
  );
}
