"use client";

import { Bookmark } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Deck } from "../../lib/flashcards";
import type { StudySession } from "../../lib/study-session";
import { deckNameLimit, getDeckFolders, isCloudScope, saveNewDeck, subjectLimit, type DeckFolder } from "../../lib/deck-storage";
import { useDeckScope } from "../../lib/use-deck-library";
import { DeckDialog } from "./deck-dialog";
import styles from "./deck-dialog.module.css";

export function SaveDeck({ deck, subject = "", session }: { deck: Deck; subject?: string; session?: StudySession }) {
  const scope = useDeckScope();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<{ scope: typeof scope; id: string } | null>(null);

  return (
    <div className={styles.saveControls}>
      <button type="button" className="secondary-button" onClick={() => setOpen(true)}>
        <Bookmark size={16} aria-hidden="true" /> Save deck
      </button>
      <div aria-live="polite" className={styles.saveFeedback}>
        {saved?.scope === scope && <Link href={`/study-decks/${saved.id}`}>Saved. Open deck</Link>}
      </div>
      {open && <SaveDeckDialog key={scope} scope={scope} deck={deck} subject={subject} session={session}
        onClose={() => setOpen(false)} onSaved={(id) => { setSaved({ id, scope }); setOpen(false); }} />}
    </div>
  );
}

function SaveDeckDialog({ scope, deck, subject, session, onClose, onSaved }: {
  scope: ReturnType<typeof useDeckScope>;
  deck: Deck;
  subject: string;
  session?: StudySession;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [folders, setFolders] = useState<DeckFolder[] | null>(null);
  const [folderLoadFailed, setFolderLoadFailed] = useState(false);
  const [title, setTitle] = useState(deck.title);
  const [category, setCategory] = useState(subject.slice(0, subjectLimit));
  const [folder, setFolder] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCloudScope(scope)) return;
    let active = true;
    getDeckFolders(scope).then(
      (folders) => { if (active) setFolders(folders.sort((a, b) => a.name.localeCompare(b.name))); },
      () => { if (active) setFolderLoadFailed(true); },
    );
    return () => { active = false; };
  }, [scope]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!title.trim()) { setError("Enter a name for this deck."); return; }
    setError("");
    setPending(true);
    try {
      const saved = await saveNewDeck(scope, { ...deck, title: title.trim() }, { subject: category, folderId: folder || null, session });
      onSaved(saved.id);
    } catch (error) {
      setError(error instanceof Error && error.message.includes("folder no longer exists")
        ? error.message : "This browser couldn’t save your deck. Check whether site storage is available, then try again.");
      setPending(false);
    }
  }

  return (
    <DeckDialog title="Save this deck" submitLabel="Save to library" pending={pending} error={error} onClose={onClose} onSubmit={submit}>
      <p className={styles.description}>{isCloudScope(scope) ? "This deck will sync to your account." : "This deck will be saved in this browser."}</p>
      <label className={styles.field}><span>Deck name</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={deckNameLimit} />
      </label>
      <label className={styles.field}><span>Subject (optional)</span>
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Biology" maxLength={subjectLimit} />
      </label>
      {isCloudScope(scope) && <label className={styles.field}><span>Folder</span>
        <select aria-label="Folder" value={folder} onChange={(event) => setFolder(event.target.value)} disabled={!folders}>
          <option value="">{folderLoadFailed ? "Folders unavailable" : "Unfiled"}</option>
          {folders?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>}
    </DeckDialog>
  );
}
