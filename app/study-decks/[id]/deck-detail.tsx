"use client";

import { BookOpen, ChevronLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import fields from "../../components/deck-dialog.module.css";
import { DeckView } from "../../deck-view";
import { getStoredDeck, saveStudySession, updateDeckCard, type DeckScope, type StoredDeck } from "../../../lib/deck-storage";
import { cardSchema, difficultyLabels, type Difficulty } from "../../../lib/flashcards";
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
    void saveStudySession(scope, id, session).then(
      (updated) => {
        setSessionError(false);
        // Keep the mounted reader in place. Retain the session if the visitor switches to editing.
        setSnapshot((previous) => previous?.deck ? { ...previous, deck: { ...previous.deck, session: updated.session, lastStudiedAt: updated.lastStudiedAt } } : previous);
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
            <h1 id="saved-deck-title">{deck?.title ?? "Study deck"}</h1>
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
            {editing ? <CardEditor deck={deck} onUpdate={(updated) => setSnapshot({ deck: updated, failed: false })} /> : (
              <DeckView deck={deck} initialSession={deck.session} onSessionChange={onSessionChange} />
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

function CardEditor({ deck, onUpdate }: { deck: StoredDeck; onUpdate: (deck: StoredDeck) => void }) {
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<StoredDeck["flashcards"][number] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const card = deck.flashcards[index];
  const values = draft ?? card;
  const dirty = card.front !== values.front || card.back !== values.back || card.difficulty !== values.difficulty;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !dirty) return;
    const checked = cardSchema.safeParse(values);
    if (!checked.success) { setError("Enter a question and an answer that fit the length limits."); return; }
    setError("");
    setNotice("");
    setPending(true);
    try {
      const updated = await updateDeckCard(deck.scope, deck.id, index, { ...checked.data, difficulty: values.difficulty });
      onUpdate(updated);
      setDraft(null);
      setNotice(`Card ${index + 1} saved.`);
    } catch {
      setError("This card couldn’t be saved. Check browser storage and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.editor} aria-labelledby="edit-card-heading">
      <header>
        <h2 id="edit-card-heading">Edit flashcards</h2>
        <p>Choose a card, then update its question, answer, or difficulty.</p>
      </header>
      <label className={fields.field}><span>Card to edit</span>
        <select aria-label="Card to edit" value={index} onChange={(event) => { setIndex(Number(event.target.value)); setDraft(null); setNotice(""); setError(""); }} disabled={pending || dirty}>
          {deck.flashcards.map((option, optionIndex) => (
            <option key={optionIndex} value={optionIndex}>{optionIndex + 1}. {option.front}</option>
          ))}
        </select>
      </label>
      <form className={styles.editorFields} onSubmit={submit}>
        <label className={fields.field}><span>Question</span>
          <textarea aria-label="Question" rows={3} required maxLength={220} value={values.front} disabled={pending} onChange={(event) => setDraft({ ...values, front: event.target.value })} />
        </label>
        <label className={fields.field}><span>Answer</span>
          <textarea aria-label="Answer" rows={4} required maxLength={480} value={values.back} disabled={pending} onChange={(event) => setDraft({ ...values, back: event.target.value })} />
        </label>
        <label className={fields.field}><span>Difficulty</span>
          <select aria-label="Difficulty" value={values.difficulty} disabled={pending} onChange={(event) => setDraft({ ...values, difficulty: event.target.value as Difficulty })}>
            {Object.entries(difficultyLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        {error && <p className={fields.error} role="alert">{error}</p>}
        <p className={notice ? styles.notice : "sr-only"} role="status">{notice}</p>
        <div className={styles.editorButtons}>
          {dirty && <button type="button" className="secondary-button" disabled={pending} onClick={() => { setDraft(null); setError(""); }}>
            Discard edits
          </button>}
          <button type="submit" className="primary-button" disabled={!dirty || pending}>{pending ? "Saving…" : "Save card"}</button>
        </div>
      </form>
    </section>
  );
}
