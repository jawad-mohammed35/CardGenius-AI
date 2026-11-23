"use client";

import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";
import type { DeckScope } from "./deck-storage";
import { useCloudAccount } from "./cloud-account";
import { deckSchema, defaultCardCount, difficultySchema, maxCardCount } from "./flashcards";

const change = "cardgenius:settings";
const temporary = new Map<string, string | null>();

export function useStoredText(key: string) {
  return useSyncExternalStore(
    useCallback((callback) => {
      function sync(event: StorageEvent) {
        if (event.key === key || event.key === null) { temporary.delete(key); callback(); }
      }
      window.addEventListener("storage", sync);
      window.addEventListener(change + key, callback);
      return () => {
        window.removeEventListener("storage", sync);
        window.removeEventListener(change + key, callback);
      };
    }, [key]),
    () => {
      if (temporary.has(key)) return temporary.get(key) ?? null;
      try { return localStorage.getItem(key); } catch { return null; }
    },
    () => null,
  );
}

export function writeStoredText(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    temporary.delete(key);
  } catch { temporary.set(key, value); }
  window.dispatchEvent(new Event(change + key));
}

export function storedJson<T>(raw: string | null, schema: z.ZodType<T>): T | undefined {
  if (!raw) return;
  try { return schema.safeParse(JSON.parse(raw)).data; } catch { return; }
}

export const studyKey = (scope: DeckScope) => `cardgenius-study-v1:${scope}`;
export const previewKey = (scope: DeckScope) => `cardgenius-preview-v1:${scope}`;
export const previewSchema = z.object({
  id: z.string(),
  deck: deckSchema,
  requested: z.number(),
  subject: z.string(),
  message: z.string().optional(),
  session: z.object({
    order: z.array(z.number().int().nonnegative()).min(1),
    position: z.number().int().nonnegative(),
    ratings: z.record(z.string(), z.enum(["known", "review"])),
    complete: z.boolean(),
  }).optional(),
}).refine(({ deck, session }) => !session || (session.position < session.order.length &&
  session.order.every((index) => index < deck.flashcards.length) &&
  Object.keys(session.ratings).every((index) => /^\d+$/.test(index) && Number(index) < deck.flashcards.length)));

const studySchema = z.object({
  difficulty: difficultySchema,
  count: z.number().int().min(1).max(maxCardCount),
  advance: z.boolean(),
  animate: z.boolean(),
});

export type StudyPreferences = z.infer<typeof studySchema>;
const defaults: StudyPreferences = { difficulty: "medium", count: defaultCardCount, advance: false, animate: true };

export function useStudyPreferences(scope: DeckScope) {
  const { profile } = useCloudAccount();
  const stored = storedJson(useStoredText(studyKey(scope)), studySchema);
  if (profile && scope === `cloud:${profile.owner_id}`) {
    return studySchema.safeParse({ difficulty: profile.difficulty, count: profile.card_count, advance: profile.auto_advance, animate: profile.animate_cards }).data ?? defaults;
  }
  return stored ?? defaults;
}
