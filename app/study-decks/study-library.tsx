"use client";

import { BookOpen, Copy, Ellipsis, Folder, FolderInput, FolderPlus, Layers, Palette, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { DeckDialog } from "../components/deck-dialog";
import { AccentSelect } from "../components/accent-select";
import { DeckIcon, deckIconChoices } from "../components/deck-icon";
import fields from "../components/deck-dialog.module.css";
import {
  deckNameLimit, deleteDeck, deleteFolder, duplicateDeck, folderNameLimit, isCloudScope, saveFolder, subjectLimit, updateDeckDetails,
  type DeckFolder, type DeckScope, type StoredDeck,
} from "../../lib/deck-storage";
import { deckColors, deckIcons, defaultDeckAppearance } from "../../lib/deck-appearance";
import { difficultyLabels, difficultyOptions } from "../../lib/flashcards";
import { useDeckLibrary, useDeckScope } from "../../lib/use-deck-library";
import styles from "./study-library.module.css";

type DialogAction =
  | { type: "newFolder" }
  | { type: "renameFolder" | "deleteFolder"; folder: DeckFolder }
  | { type: "renameDeck" | "moveDeck" | "changeIcon" | "deleteDeck"; deck: StoredDeck };

const heading = {
  newFolder: "New folder",
  renameFolder: "Rename folder",
  deleteFolder: "Delete folder?",
  renameDeck: "Rename deck",
  moveDeck: "Move to folder",
  changeIcon: "Change deck icon",
  deleteDeck: "Delete deck?",
};

const submitLabel = {
  newFolder: "Create folder",
  renameFolder: "Save changes",
  deleteFolder: "Delete folder",
  renameDeck: "Save changes",
  moveDeck: "Move deck",
  changeIcon: "Apply icon",
  deleteDeck: "Delete deck",
};

const formatDate = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const sorting = [{ value: "recent", label: "Last updated" }, { value: "created", label: "Newest created" }, { value: "name", label: "Name A–Z" }];
const colorLabels = { accent: "App accent", blue: "Blue", violet: "Violet", green: "Green", rose: "Rose", amber: "Amber" };

export function StudyLibrary() {
  const scope = useDeckScope();
  return <LibraryContents key={scope} scope={scope} />;
}

function LibraryContents({ scope }: { scope: DeckScope }) {
  const { data, failed } = useDeckLibrary(scope);
  const canManageFolders = isCloudScope(scope);
  const [folderFilter, setFolderFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const [sort, setSort] = useState("recent");
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [notice, setNotice] = useState("");
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const folders = (data?.folders ?? []).toSorted((a, b) => a.name.localeCompare(b.name));
  const decks = data?.decks ?? [];
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderCounts = new Map<string | null, number>();
  for (const { folderId } of decks) folderCounts.set(folderId, (folderCounts.get(folderId) ?? 0) + 1);
  const chosenFolder = foldersById.get(folderFilter);
  const selected = chosenFolder?.id ?? (folderFilter === "unfiled" ? "unfiled" : "all");
  const search = query.trim().toLocaleLowerCase();
  const matching = decks
    .filter((deck) => {
      const inFolder = selected === "all" || (deck.folderId ?? "unfiled") === selected;
      const byDifficulty = difficulty === "all" || deck.flashcards.some((card) => card.difficulty === difficulty);
      const byQuery = !search || [deck.title, deck.subject].some((value) => value.toLocaleLowerCase().includes(search));
      return inFolder && byDifficulty && byQuery;
    })
    .sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  async function duplicate(deck: StoredDeck) {
    if (duplicateBusy) return;
    setDuplicateBusy(true);
    setNotice("");
    try {
      const copy = await duplicateDeck(scope, deck.id);
      setNotice(`“${copy.title}” was added to your library.`);
    } catch {
      setNotice("This deck couldn’t be duplicated. Try again.");
    } finally {
      setDuplicateBusy(false);
    }
  }

  function finishDialog(message: string, nextFolder?: string) {
    if (nextFolder) setFolderFilter(nextFolder);
    setNotice(message);
    setDialog(null);
  }

  return (
    <section className={styles.library} aria-labelledby="library-heading">
      <header className={styles.pageHeader}>
        <div>
          <h1 id="library-heading">Study decks</h1>
          <p>{scope.startsWith("cloud:") ? "Find, organize, and review decks synced to your account." : "Find and review the decks you’ve saved in this browser."}</p>
        </div>
        <Link href="/" className="primary-button"><Plus size={17} aria-hidden="true" /> Create deck</Link>
      </header>

      <div className={styles.layout}>
        <aside className={`panel ${styles.sidebar}`} aria-labelledby="folders-heading">
          <div className={styles.sidebarHeader}>
            <h2 id="folders-heading">Folders</h2>
            {canManageFolders && <button type="button" className="icon-button" aria-label="New folder" title="New folder"
              onClick={() => { setNotice(""); setDialog({ type: "newFolder" }); }} disabled={failed || !data}>
              <FolderPlus size={17} aria-hidden="true" />
            </button>}
          </div>
          {!canManageFolders && <div className={styles.folderSignIn}>
            <p>Sign in to create folders and organize your study decks.</p>
            <Link href="/sign-in?next=/study-decks" className="secondary-button">Sign in</Link>
          </div>}
          <div className={styles.folderList} aria-label="Filter by folder" role="group">
            <FolderButton label="All decks" active={selected === "all"} total={decks.length} onClick={() => setFolderFilter("all")} all />
            <FolderButton label="Unfiled" active={selected === "unfiled"} total={folderCounts.get(null) ?? 0}
              onClick={() => setFolderFilter("unfiled")} />
            {folders.map((folder) => <FolderButton key={folder.id} label={folder.name} active={selected === folder.id}
              total={folderCounts.get(folder.id) ?? 0} onClick={() => setFolderFilter(folder.id)} />)}
          </div>
        </aside>

        <div className={styles.collection}>
          <div className={styles.collectionHeader}>
            <h2>{chosenFolder?.name ?? (selected === "unfiled" ? "Unfiled" : "All decks")}</h2>
            {canManageFolders && chosenFolder && <div className={styles.quickControls}>
              <button type="button" className="icon-button" aria-label="Rename folder" title="Rename folder"
                onClick={() => { setNotice(""); setDialog({ type: "renameFolder", folder: chosenFolder }); }}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="icon-button" aria-label="Delete folder" title="Delete folder"
                onClick={() => { setNotice(""); setDialog({ type: "deleteFolder", folder: chosenFolder }); }}><Trash2 size={15} aria-hidden="true" /></button>
            </div>}
          </div>

          <div className={styles.filters}>
            <label className={styles.search}>
              <span className="sr-only">Search decks</span><Search size={17} aria-hidden="true" />
              <input type="search" placeholder="Search decks…" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <AccentSelect label="Filter by difficulty" hideLabel value={difficulty} onChange={setDifficulty}
              options={[{ value: "all", label: "All difficulties" }, ...difficultyOptions]} />
            <AccentSelect label="Sort decks" hideLabel value={sort} options={sorting} onChange={setSort} />
          </div>

          <p className={notice ? styles.notice : "sr-only"} role="status">{notice}</p>
          {failed ? (
            <div className={`panel ${styles.empty}`} role="alert">
              Browser storage is unavailable. Allow site storage and reload to use saved decks.
            </div>
          ) : !data ? (
            <div className={`panel ${styles.empty}`} role="status">Loading your library…</div>
          ) : matching.length > 0 ? (
            <ul className={styles.grid} aria-label="Saved decks">
              {matching.map((deck) => <DeckTile key={deck.id} deck={deck}
                folderName={deck.folderId ? foldersById.get(deck.folderId)?.name : undefined}
                onRename={() => { setNotice(""); setDialog({ type: "renameDeck", deck }); }}
                onMove={canManageFolders ? () => { setNotice(""); setDialog({ type: "moveDeck", deck }); } : undefined}
                onIcon={() => { setNotice(""); setDialog({ type: "changeIcon", deck }); }}
                onDelete={() => { setNotice(""); setDialog({ type: "deleteDeck", deck }); }}
                onDuplicate={() => void duplicate(deck)} duplicateBusy={duplicateBusy} />)}
            </ul>
          ) : (
            <div className={`panel ${styles.empty}`}>
              <span className={styles.emptyIcon}><Layers size={22} aria-hidden="true" /></span>
              <h3>{query || difficulty !== "all" ? "No matching decks" : selected === "all" ? "No decks yet" : "No decks in this folder"}</h3>
              <p>{query || difficulty !== "all" ? "Try another search or clear your filters."
                : selected === "all" ? "Create a flashcard deck and save it here to study later."
                  : "Use a deck’s Move to folder action, or choose this folder when saving a deck."}</p>
              {query || difficulty !== "all" ? (
                <button type="button" className="secondary-button" onClick={() => { setQuery(""); setDifficulty("all"); }}>Clear filters</button>
              ) : selected === "all" && <Link href="/" className="primary-button">Create Deck</Link>}
            </div>
          )}
        </div>
      </div>

      {dialog && <LibraryDialog action={dialog} folders={folders} scope={scope} onClose={() => setDialog(null)} onSuccess={finishDialog} />}
    </section>
  );
}

function FolderButton({ label, active, total, onClick, all = false }: {
  label: string; active: boolean; total: number; onClick: () => void; all?: boolean;
}) {
  const Icon = all ? Layers : Folder;
  return (
    <button type="button" aria-pressed={active} className={styles.folderButton} onClick={onClick}>
      <Icon size={16} aria-hidden="true" />
      <span>{label}</span>
      <small aria-label={`${total} decks`}>{total}</small>
    </button>
  );
}

function DeckTile({ deck, folderName, onRename, onMove, onIcon, onDelete, onDuplicate, duplicateBusy }: {
  deck: StoredDeck; folderName: string | undefined;
  onRename: () => void; onMove?: () => void; onIcon: () => void; onDelete: () => void; onDuplicate: () => void; duplicateBusy: boolean;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuTrigger = useRef<HTMLElement>(null);
  const levels = new Set(deck.flashcards.map((card) => card.difficulty));
  const firstDifficulty = deck.flashcards[0].difficulty;
  const difficulty = levels.size === 1 ? difficultyLabels[firstDifficulty] : "Mixed difficulty";
  const href = `/study-decks/${deck.id}`;

  function closeMenu() {
    if (menuRef.current) menuRef.current.open = false;
    menuTrigger.current?.focus();
  }

  return (
    <li className={`panel ${styles.deckTile}`}>
      <div className={styles.tileHeader}>
        <DeckIcon appearance={deck.appearance} />
        <details ref={menuRef} name="deck-actions" className={styles.menu} onKeyDown={(event) => {
          if (event.key === "Escape" && menuRef.current?.open) { event.preventDefault(); closeMenu(); }
        }} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}>
          <summary ref={menuTrigger} aria-label={`More actions for ${deck.title}`} title="More actions"><Ellipsis size={19} aria-hidden="true" /></summary>
          <div className={styles.menuButtons}>
            <Link href={href} onClick={closeMenu}><BookOpen size={15} aria-hidden="true" /> Study deck</Link>
            <Link href={`${href}?view=edit`} onClick={closeMenu}><Pencil size={15} aria-hidden="true" /> Edit cards</Link>
            <button type="button" onClick={() => { closeMenu(); onRename(); }}>
              <Pencil size={15} aria-hidden="true" /> Rename deck
            </button>
            {onMove && <button type="button" onClick={() => { closeMenu(); onMove(); }}>
              <FolderInput size={15} aria-hidden="true" /> Move to folder
            </button>}
            <button type="button" onClick={() => { closeMenu(); onIcon(); }}>
              <Palette size={15} aria-hidden="true" /> Change deck icon
            </button>
            <button type="button" disabled={duplicateBusy} onClick={() => { closeMenu(); onDuplicate(); }}>
              <Copy size={15} aria-hidden="true" /> Duplicate deck
            </button>
            <hr />
            <button type="button" className={styles.destructive}
              onClick={() => { closeMenu(); onDelete(); }}>
              <Trash2 size={15} aria-hidden="true" /> Delete deck
            </button>
          </div>
        </details>
      </div>
      <h3><Link href={href}>{deck.title}</Link></h3>
      {deck.subject && <p className={styles.context}>{deck.subject}</p>}
      <div className={styles.tags}>
        <span>{deck.flashcards.length} {deck.flashcards.length === 1 ? "card" : "cards"}</span>
        <span>{difficulty}</span>
        {folderName && <span className={styles.folderTag} title={folderName}><Folder size={13} aria-hidden="true" /><span>{folderName}</span></span>}
      </div>
      <dl className={styles.timestamps}>
        <div><dt>Created</dt><dd><time dateTime={deck.createdAt}>{formatDate.format(new Date(deck.createdAt))}</time></dd></div>
        <div><dt>Updated</dt><dd><time dateTime={deck.updatedAt}>{formatDate.format(new Date(deck.updatedAt))}</time></dd></div>
        {deck.lastStudiedAt && <div><dt>Last studied</dt><dd><time dateTime={deck.lastStudiedAt}>{formatDate.format(new Date(deck.lastStudiedAt))}</time></dd></div>}
      </dl>
      <div className={styles.tileActions}>
        <Link href={href} className="primary-button" aria-label={`Study ${deck.title}`}><BookOpen size={16} aria-hidden="true" /> Study</Link>
        <Link href={`${href}?view=edit`} className="secondary-button" aria-label={`Edit cards in ${deck.title}`}><Pencil size={15} aria-hidden="true" /> Edit cards</Link>
      </div>
    </li>
  );
}

function LibraryDialog({ action, folders, scope, onClose, onSuccess }: {
  action: DialogAction; folders: DeckFolder[]; scope: DeckScope;
  onClose: () => void; onSuccess: (message: string, nextFolder?: string) => void;
}) {
  const isDeleting = action.type === "deleteDeck" || action.type === "deleteFolder";
  const [name, setName] = useState("deck" in action ? action.deck.title : "folder" in action ? action.folder.name : "");
  const [subject, setSubject] = useState("deck" in action ? action.deck.subject : "");
  const [folderId, setFolderId] = useState("deck" in action ? action.deck.folderId ?? "" : "");
  const [appearance, setAppearance] = useState("deck" in action ? action.deck.appearance ?? defaultDeckAppearance : defaultDeckAppearance);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (["renameDeck", "renameFolder", "newFolder"].includes(action.type) && !name.trim()) { setError("Enter a name to continue."); return; }
    setPending(true);
    setError("");
    try {
      if (action.type === "deleteDeck") {
        await deleteDeck(scope, action.deck.id);
        onSuccess(`“${action.deck.title}” was deleted.`);
      } else if (action.type === "deleteFolder") {
        await deleteFolder(scope, action.folder.id);
        onSuccess(`“${action.folder.name}” was deleted. Its decks moved to Unfiled.`, "all");
      } else if (action.type === "renameDeck") {
        await updateDeckDetails(scope, action.deck.id, { title: name, subject });
        onSuccess("Deck details saved.");
      } else if (action.type === "moveDeck") {
        await updateDeckDetails(scope, action.deck.id, { folderId: folderId || null });
        onSuccess(`Deck moved to ${folders.find(({ id }) => id === folderId)?.name ?? "Unfiled"}.`);
      } else if (action.type === "changeIcon") {
        await updateDeckDetails(scope, action.deck.id, { appearance });
        onSuccess("Deck icon updated.");
      } else if (action.type === "newFolder" || action.type === "renameFolder") {
        const folder = await saveFolder(scope, name, action.type === "renameFolder" ? action.folder.id : undefined);
        onSuccess(action.type === "renameFolder" ? "Folder renamed." : "Folder created.", folder.id);
      }
    } catch (error) {
      setError(error instanceof Error && /already exists|no longer/.test(error.message)
        ? error.message : "Your changes couldn’t be saved. Try again.");
      setPending(false);
    }
  }

  return (
    <DeckDialog title={heading[action.type]} submitLabel={submitLabel[action.type]} pending={pending} error={error}
      destructive={isDeleting} onClose={onClose} onSubmit={submit}>
      {isDeleting ? (
        <p className={fields.description}>{action.type === "deleteDeck"
          ? <>Delete “{name}” and its study progress? This can’t be undone.</>
          : <>Delete “{name}”? Its decks will move to Unfiled.</>}</p>
      ) : action.type === "moveDeck" ? (
        <div className={fields.field}>
          <AccentSelect label="Destination folder" value={folderId} onChange={setFolderId} disabled={pending}
            options={[{ value: "", label: "Unfiled" }, ...folders.map(({ id, name }) => ({ value: id, label: name }))]} />
        </div>
      ) : action.type === "changeIcon" ? (
        <>
          <div className={styles.iconPreview}><DeckIcon appearance={appearance} size={22} /><strong>{name}</strong></div>
          <fieldset className={styles.iconPicker}>
            <legend>Icon</legend>
            <div className={styles.icons}>
              {deckIcons.map((icon) => <label key={icon}>
                <input type="radio" name="deck-icon" checked={appearance.icon === icon} disabled={pending}
                  onChange={() => setAppearance({ ...appearance, icon })} />
                <DeckIcon appearance={{ ...appearance, icon }} size={17} /><span>{deckIconChoices[icon].label}</span>
              </label>)}
            </div>
          </fieldset>
          <fieldset className={styles.iconPicker}>
            <legend>Color</legend>
            <div className={styles.iconColors}>
              {deckColors.map((color) => <label key={color} title={colorLabels[color]}>
                <input type="radio" name="deck-color" aria-label={colorLabels[color]} checked={appearance.color === color} disabled={pending}
                  onChange={() => setAppearance({ ...appearance, color })} />
                <span className="deck-emblem" data-color={color} aria-hidden="true" />
              </label>)}
            </div>
          </fieldset>
          <button type="button" className={`text-button ${styles.restoreIcon}`} disabled={pending}
            onClick={() => setAppearance(defaultDeckAppearance)}>Restore default icon</button>
        </>
      ) : (
        <>
          <label className={fields.field}><span>{action.type === "renameDeck" ? "Deck name" : "Folder name"}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required
              maxLength={action.type === "renameDeck" ? deckNameLimit : folderNameLimit} />
          </label>
          {action.type === "renameDeck" && <>
            <label className={fields.field}><span>Subject (optional)</span>
              <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={subjectLimit} placeholder="e.g. Biology" />
            </label>
          </>}
        </>
      )}
    </DeckDialog>
  );
}
