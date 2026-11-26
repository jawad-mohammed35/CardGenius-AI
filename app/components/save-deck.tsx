"use client";

import { Bookmark, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Deck } from "../../lib/flashcards";
import type { StudySession } from "../../lib/study-session";
import { deckNameLimit, folderNameLimit, getDeckFolders, isCloudScope, saveFolder, saveNewDeck, subjectLimit, type DeckFolder } from "../../lib/deck-storage";
import { useDeckScope } from "../../lib/use-deck-library";
import { DeckDialog } from "./deck-dialog";
import { AccentSelect } from "./accent-select";
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
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [pending, setPending] = useState<"deck" | "folder" | null>(null);
  const [error, setError] = useState("");
  const folderInput = useRef<HTMLInputElement>(null);
  const createButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isCloudScope(scope)) return;
    let active = true;
    getDeckFolders(scope).then(
      (loaded) => { if (active) setFolders((current) => {
        const merged = new Map([...loaded, ...(current ?? [])].map((item) => [item.id, item]));
        return [...merged.values()];
      }); },
      () => { if (active) setFolderLoadFailed(true); },
    );
    return () => { active = false; };
  }, [scope]);

  function closeFolderFields() {
    setCreating(false);
    setFolderName("");
    requestAnimationFrame(() => createButton.current?.focus());
  }

  async function createFolder() {
    if (pending) return;
    if (!folderName.trim()) { setError("Enter a folder name."); folderInput.current?.focus(); return; }
    setError("");
    setPending("folder");
    try {
      const created = await saveFolder(scope, folderName);
      setFolders((existing) => [...(existing ?? []), created]);
      setFolder(created.id);
      closeFolderFields();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Couldn’t create this folder. Try again.");
      requestAnimationFrame(() => folderInput.current?.focus());
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || creating) return;
    if (!title.trim()) { setError("Enter a name for this deck."); return; }
    setError("");
    setPending("deck");
    try {
      const saved = await saveNewDeck(scope, { ...deck, title: title.trim() }, { subject: category, folderId: folder || null, session });
      onSaved(saved.id);
    } catch (error) {
      if (error instanceof Error && error.message.includes("folder no longer exists")) {
        setFolders((current) => current?.filter((item) => item.id !== folder) ?? []);
        setFolder("");
        setError(error.message);
      } else setError("Couldn’t save your deck. Your generated cards are still available. Try again.");
      setPending(null);
    }
  }

  return (
    <DeckDialog title="Save this deck" submitLabel="Save to library" pending={pending !== null} submitDisabled={creating}
      error={error} onClose={onClose} onSubmit={submit}>
      <p className={styles.description}>{isCloudScope(scope) ? "This deck will sync to your account." : "This deck will be saved in this browser."}</p>
      <label className={styles.field}><span>Deck name</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={pending !== null} required maxLength={deckNameLimit} />
      </label>
      <label className={styles.field}><span>Subject (optional)</span>
        <input value={category} onChange={(event) => setCategory(event.target.value)} disabled={pending !== null} placeholder="e.g. Biology" maxLength={subjectLimit} />
      </label>
      {isCloudScope(scope) && <div className={styles.field}>
        <AccentSelect label="Folder" value={folder} onChange={setFolder} disabled={pending !== null}
          options={[{ value: "", label: "Unfiled" }, ...(folders ?? []).toSorted((a, b) => a.name.localeCompare(b.name))
            .map(({ id, name }) => ({ value: id, label: name }))]} />
        {folderLoadFailed && <p className={styles.description}>Existing folders couldn’t be loaded.</p>}
        {creating ? <div className={styles.inlineFolder}>
          <label className={styles.field}><span>New folder name</span>
            <input ref={folderInput} value={folderName} disabled={pending !== null} maxLength={folderNameLimit}
              onChange={(event) => setFolderName(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); void createFolder(); }
              }} />
          </label>
          <div className={styles.inlineActions}>
            <button type="button" className="text-button" disabled={pending !== null} onClick={() => { closeFolderFields(); setError(""); }}>Cancel new folder</button>
            <button type="button" className="secondary-button" disabled={pending !== null} onClick={() => void createFolder()}>
              {pending === "folder" ? "Creating…" : "Create folder"}
            </button>
          </div>
        </div> : <button type="button" ref={createButton} className={`text-button ${styles.newFolder}`} disabled={pending !== null}
          onClick={() => { setCreating(true); setError(""); requestAnimationFrame(() => folderInput.current?.focus()); }}>
          <FolderPlus size={16} aria-hidden="true" /> New folder
        </button>}
      </div>}
    </DeckDialog>
  );
}
