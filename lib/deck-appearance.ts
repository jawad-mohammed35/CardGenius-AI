import { z } from "zod";

export const deckIcons = ["layers", "science", "technology", "math", "languages", "history", "medicine", "business", "nature", "arts", "geography", "books"] as const;
export const deckColors = ["accent", "blue", "violet", "green", "rose", "amber"] as const;
export const deckAppearanceSchema = z.object({ icon: z.enum(deckIcons), color: z.enum(deckColors) });
export type DeckAppearance = z.infer<typeof deckAppearanceSchema>;
export const defaultDeckAppearance: DeckAppearance = { icon: "layers", color: "accent" };
