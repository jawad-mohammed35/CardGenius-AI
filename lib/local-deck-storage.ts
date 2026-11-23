import { deckSchema, type Deck } from "./flashcards.ts";
import { z } from "zod";
import type { StudySession } from "./study-session.ts";

export type LocalDeckScope = "guest" | "demo";
export type DeckScope = LocalDeckScope;

export type StoredDeck = Deck & {
  id: string;
  scope: DeckScope;
  subject: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  lastStudiedAt: string | null;
  session: StudySession | null;
};

export type DeckFolder = {
  id: string;
  scope: DeckScope;
  name: string;
};

export type DeckLibrary = { decks: StoredDeck[]; folders: DeckFolder[] };
export const deckNameLimit = 100;
export const folderNameLimit = 60;
export const subjectLimit = 160;

const databaseName = "cardgenius-library";
const changedEvent = "cardgenius-library-change";
let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      for (const name of ["decks", "folders"]) {
        const store = request.result.createObjectStore(name, { keyPath: ["scope", "id"] });
        store.createIndex("scope", "scope");
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onclose = () => { databasePromise = undefined; };
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const database = await openDatabase();
  const current = database.transaction(stores, mode);
  const finished = new Promise<void>((resolve, reject) => {
    current.oncomplete = () => resolve();
    current.onabort = () => reject(current.error ?? new Error("The library update was interrupted."));
  });

  const result = Promise.resolve().then(() => operation(current)).catch((error: unknown) => {
    try { current.abort(); } catch { /* The transaction may already have failed. */ }
    throw error;
  });
  const [value] = await Promise.all([result, finished]);
  return value;
}

export function emitChange(scope: string) {
  const signal = `${changedEvent}:${scope}`;
  window.dispatchEvent(new Event(signal));
  try {
    localStorage.setItem(signal, crypto.randomUUID());
  } catch {
    // IndexedDB stays usable if localStorage is unavailable.
  }
}

export function subscribeToLibrary(scope: string, callback: () => void) {
  const signal = `${changedEvent}:${scope}`;
  const onStorage = (event: StorageEvent) => { if (event.key === signal) callback(); };
  window.addEventListener(signal, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(signal, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export async function getDeckLibrary(scope: DeckScope): Promise<DeckLibrary> {
  return transaction(["decks", "folders"], "readonly", async (current) => {
    const [decks, folders] = await Promise.all([
      requestResult<StoredDeck[]>(current.objectStore("decks").index("scope").getAll(scope)),
      requestResult<DeckFolder[]>(current.objectStore("folders").index("scope").getAll(scope)),
    ]);
    return { decks, folders };
  });
}

export async function getStoredDeck(scope: DeckScope, id: string): Promise<StoredDeck | undefined> {
  return transaction("decks", "readonly", (current) => requestResult(current.objectStore("decks").get([scope, id])));
}

export async function getDeckFolders(scope: DeckScope): Promise<DeckFolder[]> {
  return transaction("folders", "readonly", (current) => requestResult(current.objectStore("folders").index("scope").getAll(scope)));
}

function title(name: string, limit: number) {
  const value = name.trim();
  if (!value || value.length > limit) throw new Error(`Enter a name between 1 and ${limit} characters.`);
  return value;
}

async function requireFolder(current: IDBTransaction, scope: DeckScope, folderId: string | null) {
  if (folderId && !(await requestResult(current.objectStore("folders").get([scope, folderId])))) {
    throw new Error("This folder no longer exists. Choose another folder.");
  }
}

export async function saveNewDeck(
  scope: DeckScope,
  deck: Deck,
  options: { subject: string; folderId: string | null; session?: StudySession },
): Promise<StoredDeck> {
  const now = new Date().toISOString();
  const stored: StoredDeck = {
    ...deckSchema.parse(deck),
    id: crypto.randomUUID(),
    scope,
    subject: options.subject.trim().slice(0, subjectLimit),
    folderId: options.folderId,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    session: options.session ?? null,
  };
  await transaction(["decks", "folders"], "readwrite", async (current) => {
    await requireFolder(current, scope, stored.folderId);
    await requestResult(current.objectStore("decks").add(stored));
  });
  emitChange(scope);
  return stored;
}

async function updateDeck(
  scope: DeckScope,
  id: string,
  update: (deck: StoredDeck, transaction: IDBTransaction) => StoredDeck | Promise<StoredDeck>,
): Promise<StoredDeck> {
  const result = await transaction(["decks", "folders"], "readwrite", async (current) => {
    const decks = current.objectStore("decks");
    const deck = await requestResult<StoredDeck | undefined>(decks.get([scope, id]));
    if (!deck) throw new Error("This deck is no longer available.");
    const updated = await update(deck, current);
    await requestResult(decks.put(updated));
    return updated;
  });
  emitChange(scope);
  return result;
}

export function updateDeckDetails(
  scope: DeckScope,
  id: string,
  changes: { title: string; subject: string; folderId: string | null },
) {
  return updateDeck(scope, id, async (deck, current) => {
    await requireFolder(current, scope, changes.folderId);
    return {
      ...deck,
      title: title(changes.title, deckNameLimit),
      subject: changes.subject.trim().slice(0, subjectLimit),
      folderId: changes.folderId,
      updatedAt: new Date().toISOString(),
    };
  });
}

export function updateDeckCard(scope: DeckScope, id: string, index: number, card: Deck["flashcards"][number]) {
  return updateDeck(scope, id, (deck) => {
    if (!deck.flashcards[index]) throw new Error("This card is no longer available.");
    const flashcards = [...deck.flashcards];
    flashcards[index] = card;
    const parsed = deckSchema.parse({ title: deck.title, flashcards });
    let session = deck.session;
    if (session) {
      const ratings = { ...session.ratings };
      delete ratings[index];
      const order = session.order.includes(index) ? session.order : [...session.order, index];
      session = { ...session, order, ratings, complete: false };
    }
    return { ...deck, ...parsed, session, updatedAt: new Date().toISOString() };
  });
}

export function saveStudySession(scope: DeckScope, id: string, session: StudySession) {
  return updateDeck(scope, id, (deck) => ({ ...deck, session, lastStudiedAt: new Date().toISOString() }));
}

export async function deleteDeck(scope: DeckScope, id: string) {
  await transaction("decks", "readwrite", (current) => requestResult(current.objectStore("decks").delete([scope, id])));
  emitChange(scope);
}

export async function duplicateDeck(scope: DeckScope, id: string) {
  const deck = await getStoredDeck(scope, id);
  if (!deck) throw new Error("This deck is no longer available.");
  const suffix = " (copy)";
  return saveNewDeck(scope, {
    title: deck.title.slice(0, deckNameLimit - suffix.length) + suffix,
    flashcards: deck.flashcards,
  }, { subject: deck.subject, folderId: deck.folderId });
}

export async function saveFolder(scope: DeckScope, name: string, id?: string): Promise<DeckFolder> {
  const folder = { scope, id: id ?? crypto.randomUUID(), name: title(name, folderNameLimit) };
  await transaction("folders", "readwrite", async (current) => {
    const folders = current.objectStore("folders");
    const existing = await requestResult<DeckFolder[]>(folders.index("scope").getAll(scope));
    if (id && !existing.some((item) => item.id === id)) throw new Error("This folder is no longer available.");
    const taken = existing.some((item) => item.id !== folder.id && item.name.localeCompare(folder.name, undefined, { sensitivity: "accent" }) === 0);
    if (taken) throw new Error("A folder with that name already exists.");
    await requestResult(folders.put(folder));
  });
  emitChange(scope);
  return folder;
}

export async function deleteFolder(scope: DeckScope, id: string) {
  await transaction(["decks", "folders"], "readwrite", async (current) => {
    const decks = current.objectStore("decks");
    const affected = (await requestResult<StoredDeck[]>(decks.index("scope").getAll(scope))).filter((deck) => deck.folderId === id);
    const now = new Date().toISOString();
    await Promise.all([
      requestResult(current.objectStore("folders").delete([scope, id])),
      ...affected.map((deck) => requestResult(decks.put({ ...deck, folderId: null, updatedAt: now }))),
    ]);
  });
  emitChange(scope);
}

const backupSchema = z.object({
  version: z.literal(1),
  decks: z.array(deckSchema.extend({
    subject: z.string().max(subjectLimit).default(""),
    folder: z.string().trim().min(1).max(folderNameLimit).nullable(),
  })).max(500),
});

export function exportLibrary(library: DeckLibrary) {
  const folders = new Map(library.folders.map(({ id, name }) => [id, name]));
  return JSON.stringify({ version: 1, decks: library.decks.map(({ title, flashcards, subject, folderId }) =>
    ({ title, flashcards, subject, folder: folders.get(folderId ?? "") ?? null })) }, null, 2);
}

export function readBackup(contents: string) {
  let value: unknown;
  try { value = JSON.parse(contents); } catch { throw new Error("Choose a valid CardGeniusAI JSON backup."); }
  const backup = backupSchema.safeParse(value);
  if (!backup.success) throw new Error("Choose a CardGeniusAI JSON backup with up to 500 valid decks.");
  return backup.data.decks;
}

export async function importLibrary(scope: DeckScope, contents: string) {
  const importedDecks = readBackup(contents);
  const now = new Date().toISOString();
  await transaction(["decks", "folders"], "readwrite", async (current) => {
    const folderStore = current.objectStore("folders");
    const deckStore = current.objectStore("decks");
    const existing = await requestResult<DeckFolder[]>(folderStore.index("scope").getAll(scope));
    const folders = new Map(existing.map(({ id, name }) => [name.toLowerCase(), id]));
    const operations: Promise<IDBValidKey>[] = [];
    for (const { folder, ...deck } of importedDecks) {
      const name = folder?.toLowerCase();
      if (folder && name && !folders.has(name)) {
        const id = crypto.randomUUID();
        folders.set(name, id);
        operations.push(requestResult(folderStore.add({ id, scope, name: folder })));
      }
      const stored: StoredDeck = { ...deck, id: crypto.randomUUID(), scope, folderId: folders.get(name ?? "") ?? null,
        createdAt: now, updatedAt: now, lastStudiedAt: null, session: null };
      operations.push(requestResult(deckStore.add(stored)));
    }
    await Promise.all(operations);
  });
  emitChange(scope);
  return importedDecks.length;
}

export async function clearLibrary(scope: DeckScope) {
  await transaction(["decks", "folders"], "readwrite", async (current) => {
    await Promise.all(["decks", "folders"].map(async (name) => {
      const store = current.objectStore(name);
      const keys = await requestResult(store.index("scope").getAllKeys(scope));
      await Promise.all(keys.map((key) => requestResult(store.delete(key))));
    }));
  });
  emitChange(scope);
}
