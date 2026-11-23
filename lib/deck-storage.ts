import { browserSupabase } from "./supabase/browser";
import { deckSchema, type Deck } from "./flashcards";
import type { StudySession } from "./study-session";
import { subjectLimit } from "./local-deck-storage";
import * as local from "./local-deck-storage";

export type DeckScope = local.LocalDeckScope | `cloud:${string}`;
export type StoredDeck = Omit<local.StoredDeck, "scope"> & { scope: DeckScope };
export type DeckFolder = Omit<local.DeckFolder, "scope"> & { scope: DeckScope };
export type DeckLibrary = { decks: StoredDeck[]; folders: DeckFolder[] };
export { deckNameLimit, folderNameLimit, subjectLimit, subscribeToLibrary } from "./local-deck-storage";

export function isCloudScope(scope: DeckScope): scope is `cloud:${string}` {
  return scope !== "guest" && scope !== "demo";
}

function owner(scope: `cloud:${string}`) { return scope.slice(6); }
const selectDeck = "id,folder_id,title,subject,created_at,updated_at,last_studied_at,study_session,flashcards(position,front,back,difficulty)";
type DeckRow = {
  id: string; folder_id: string | null; title: string; subject: string; created_at: string; updated_at: string;
  last_studied_at: string | null; study_session: StudySession | null; flashcards: Array<Deck["flashcards"][number] & { position: number }>;
};

function toDeck(row: DeckRow, scope: DeckScope): StoredDeck {
  const deck = deckSchema.parse({ title: row.title, flashcards: [...row.flashcards].sort((a, b) => a.position - b.position) });
  return { ...deck, scope, id: row.id, subject: row.subject, folderId: row.folder_id, createdAt: row.created_at, updatedAt: row.updated_at,
    lastStudiedAt: row.last_studied_at, session: validateSession(row.study_session, deck.flashcards.length) };
}

function validateSession(session: StudySession | null | undefined, count: number): StudySession | null {
  if (!session || !Array.isArray(session.order) || !session.order.length || session.order.length > count ||
    new Set(session.order).size !== session.order.length ||
    !session.order.every((index) => Number.isInteger(index) && index >= 0 && index < count) ||
    !Number.isInteger(session.position) || session.position < 0 || session.position >= session.order.length) return null;
  const ratings = Object.fromEntries(Object.entries(session.ratings ?? {}).filter(([index, rating]) =>
    /^\d+$/.test(index) && Number(index) < count && (rating === "known" || rating === "review")));
  return { order: session.order, position: session.position, ratings,
    complete: Boolean(session.complete) && session.order.every((index) => ratings[index]) };
}

function requireResult<T>(result: { data: T; error: unknown }, message = "Your library couldn’t be updated. Try again.") {
  if (result.error) throw new Error(message);
  return result.data;
}

export async function getDeckFolders(scope: DeckScope): Promise<DeckFolder[]> {
  if (!isCloudScope(scope)) return local.getDeckFolders(scope);
  const rows = requireResult(await browserSupabase().from("folders").select("id,name").eq("owner_id", owner(scope)), "Couldn’t load your folders.");
  return (rows ?? []).map((row) => ({ ...row, scope }));
}

export async function getDeckLibrary(scope: DeckScope): Promise<DeckLibrary> {
  if (!isCloudScope(scope)) return local.getDeckLibrary(scope);
  const [result, folders] = await Promise.all([
    browserSupabase().from("decks").select(selectDeck).eq("owner_id", owner(scope)).order("updated_at", { ascending: false }),
    getDeckFolders(scope),
  ]);
  const rows = requireResult(result, "Couldn’t load your cloud library.") as DeckRow[] | null;
  return { decks: (rows ?? []).flatMap((row) => row.flashcards.length ? [toDeck(row, scope)] : []), folders };
}

export async function getStoredDeck(scope: DeckScope, id: string): Promise<StoredDeck | undefined> {
  if (!isCloudScope(scope)) return local.getStoredDeck(scope, id);
  const result = await browserSupabase().from("decks").select(selectDeck).eq("owner_id", owner(scope)).eq("id", id).maybeSingle();
  const row = requireResult(result, "Couldn’t load this deck.") as DeckRow | null;
  if (row?.flashcards.length) return toDeck(row, scope);
}

type SaveOptions = Parameters<typeof local.saveNewDeck>[2];

async function storeCloudDeck(scope: `cloud:${string}`, deck: Deck, options: SaveOptions, original?: StoredDeck) {
  const parsed = deckSchema.parse(deck);
  return requireResult(await browserSupabase().rpc("cg_store_deck", {
    p_owner: owner(scope), p_title: parsed.title, p_subject: options.subject.trim().slice(0, subjectLimit), p_folder: options.folderId,
    p_cards: parsed.flashcards, p_session: validateSession(options.session, deck.flashcards.length),
    ...(original ? {
      p_import_key: original.scope + ":" + original.id,
      p_created_at: original.createdAt, p_updated_at: original.updatedAt, p_last_studied_at: original.lastStudiedAt,
    } : {}),
  }), `Couldn’t save “${parsed.title}”.`) as string | null;
}

export async function saveNewDeck(scope: DeckScope, deck: Deck, options: SaveOptions) {
  if (!isCloudScope(scope)) return local.saveNewDeck(scope, deck, options);
  const id = await storeCloudDeck(scope, deck, options);
  if (!id) throw new Error("The deck couldn’t be saved.");
  local.emitChange(scope);
  return { id, title: deck.title };
}

export async function updateDeckDetails(scope: DeckScope, id: string, changes: { title: string; subject: string; folderId: string | null }) {
  if (!isCloudScope(scope)) return local.updateDeckDetails(scope, id, changes);
  requireResult(await browserSupabase().from("decks").update({
    title: changes.title.trim(), subject: changes.subject.trim().slice(0, subjectLimit), folder_id: changes.folderId, updated_at: new Date().toISOString(),
  }).eq("owner_id", owner(scope)).eq("id", id).select("id").single());
  local.emitChange(scope);
}

export async function updateDeckCard(scope: DeckScope, id: string, position: number, card: Deck["flashcards"][number]) {
  if (!isCloudScope(scope)) return local.updateDeckCard(scope, id, position, card);
  requireResult(await browserSupabase().rpc("cg_edit_card", { p_deck: id, p_position: position, p_card: card }));
  local.emitChange(scope);
  const deck = await getStoredDeck(scope, id);
  if (!deck) throw new Error("This deck is no longer available.");
  return deck;
}

export async function saveStudySession(scope: DeckScope, id: string, session: StudySession) {
  if (!isCloudScope(scope)) return local.saveStudySession(scope, id, session);
  const lastStudiedAt = new Date().toISOString();
  requireResult(await browserSupabase().from("decks").update({ study_session: session, last_studied_at: lastStudiedAt })
    .eq("owner_id", owner(scope)).eq("id", id).select("id").single());
  local.emitChange(scope);
  return { session, lastStudiedAt };
}

export async function deleteDeck(scope: DeckScope, id: string) {
  if (!isCloudScope(scope)) return local.deleteDeck(scope, id);
  requireResult(await browserSupabase().from("decks").delete().eq("owner_id", owner(scope)).eq("id", id));
  local.emitChange(scope);
}

export async function duplicateDeck(scope: DeckScope, id: string) {
  if (!isCloudScope(scope)) return local.duplicateDeck(scope, id);
  const deck = await getStoredDeck(scope, id);
  if (!deck) throw new Error("This deck is no longer available.");
  return saveNewDeck(scope, { title: deck.title.slice(0, 93) + " (copy)", flashcards: deck.flashcards }, { subject: deck.subject, folderId: deck.folderId });
}

export async function saveFolder(scope: DeckScope, name: string, id?: string): Promise<DeckFolder> {
  if (!isCloudScope(scope)) return local.saveFolder(scope, name, id);
  const table = browserSupabase().from("folders");
  const fields = { name: name.trim() };
  const row = requireResult(await (id ? table.update(fields).eq("owner_id", owner(scope)).eq("id", id)
    : table.insert({ ...fields, owner_id: owner(scope) })).select("id,name").single(), "Choose a unique folder name.");
  local.emitChange(scope);
  return { ...row!, scope };
}

export async function deleteFolder(scope: DeckScope, id: string) {
  if (!isCloudScope(scope)) return local.deleteFolder(scope, id);
  requireResult(await browserSupabase().from("folders").delete().eq("owner_id", owner(scope)).eq("id", id));
  local.emitChange(scope);
}

export function exportLibrary(library: DeckLibrary) {
  return local.exportLibrary(library as local.DeckLibrary);
}

async function importFolders(scope: `cloud:${string}`, names: Iterable<string>) {
  const folders = new Map((await getDeckFolders(scope)).map(({ id, name }) => [name.toLowerCase(), id]));
  for (const name of new Set(names)) {
    if (folders.has(name.toLowerCase())) continue;
    try {
      const folder = await saveFolder(scope, name);
      folders.set(name.toLowerCase(), folder.id);
    } catch {
      const raced = (await getDeckFolders(scope)).find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (!raced) throw new Error("Couldn’t import the folder. Try again.");
      folders.set(name.toLowerCase(), raced.id);
    }
  }
  return folders;
}

export async function importLibrary(scope: DeckScope, contents: string) {
  if (!isCloudScope(scope)) return local.importLibrary(scope, contents);
  const decks = local.readBackup(contents);
  const folders = await importFolders(scope, decks.flatMap((deck) => deck.folder ?? []));
  for (const deck of decks) await storeCloudDeck(scope, deck, { subject: deck.subject, folderId: folders.get(deck.folder?.toLowerCase() ?? "") ?? null });
  local.emitChange(scope);
  return decks.length;
}

export async function countLocalDecks() {
  const libraries = await Promise.all([local.getDeckLibrary("guest"), local.getDeckLibrary("demo")]);
  return libraries.reduce((total, library) => total + library.decks.length, 0);
}

export async function migrateLocalDecks(scope: `cloud:${string}`) {
  const libraries = await Promise.all([local.getDeckLibrary("guest"), local.getDeckLibrary("demo")]);
  const folders = await importFolders(scope, libraries.flatMap((library) => library.folders.map(({ name }) => name)));
  let imported = 0;
  for (const library of libraries) {
    const names = new Map(library.folders.map(({ id, name }) => [id, name.toLowerCase()]));
    for (const deck of library.decks) {
      const folderId = folders.get(names.get(deck.folderId ?? "") ?? "") ?? null;
      if (await storeCloudDeck(scope, deck, { subject: deck.subject, folderId, session: deck.session ?? undefined }, deck)) imported++;
    }
  }
  local.emitChange(scope);
  return imported;
}

export async function clearLibrary(scope: DeckScope) {
  if (!isCloudScope(scope)) return local.clearLibrary(scope);
  requireResult(await browserSupabase().from("decks").delete().eq("owner_id", owner(scope)));
  requireResult(await browserSupabase().from("folders").delete().eq("owner_id", owner(scope)));
  local.emitChange(scope);
}
