import { z } from "zod";

export const topicLimit = 160;
export const notesLimit = 8_000;
export const minTopicChars = 3;
export const minNotesChars = 20;
export const cardCounts = [5, 10, 15, 20] as const;
export const defaultCardCount = 10;
export const maxCardCount = 100;
export const maxFiles = 5;
export const maxFileBytes = 2_500_000;
export const maxTotalFileBytes = 3_500_000;

const attachmentKinds = {
  pdf: "PDF",
  docx: "Word",
  jpg: "Image",
  jpeg: "Image",
  png: "Image",
  webp: "Image",
} as const;

export const acceptedFileTypes = Object.keys(attachmentKinds).map((extension) => "." + extension).join(",");

export function attachmentKind(fileName: string) {
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase();
  return extension && Object.hasOwn(attachmentKinds, extension)
    ? attachmentKinds[extension as keyof typeof attachmentKinds]
    : undefined;
}

export const difficultySchema = z.enum(["easy", "medium", "hard", "expert"]);
export const difficultyLabels = {
  easy: "Beginner",
  medium: "Intermediate",
  hard: "Advanced",
  expert: "Expert",
};

export const difficultyDescriptions = {
  easy: "Basic definitions and introductory concepts.",
  medium: "Conceptual understanding and practical applications.",
  hard: "Detailed explanations and deeper reasoning.",
  expert: "Critical thinking and complex problem-solving.",
};

const optionalSource = (minimum: number, maximum: number) => z.string().trim().max(maximum)
  .refine((text) => !text || text.length >= minimum).transform((text) => text || undefined).optional();

export const generationSchema = z.object({
  topic: optionalSource(minTopicChars, topicLimit),
  notes: optionalSource(minNotesChars, notesLimit),
  difficulty: difficultySchema.default("medium"),
  count: z.number().int().min(1).max(maxCardCount).default(defaultCardCount),
});

export const cardSchema = z.object({
  front: z.string().trim().min(1).max(220),
  back: z.string().trim().min(1).max(480),
});

export const deckSchema = z.object({
  title: z.string().trim().min(1).max(100),
  flashcards: z.array(cardSchema.extend({ difficulty: difficultySchema })).min(1).max(maxCardCount),
});

export const generationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), completed: z.number().int().nonnegative(), total: z.number().int().positive(), message: z.string().optional() }),
  z.object({ type: z.literal("done"), deck: deckSchema, message: z.string().optional() }),
  z.object({ type: z.literal("error"), error: z.string() }),
]);

export type Difficulty = z.infer<typeof difficultySchema>;
export type CardCount = number;
export type GenerationInput = z.infer<typeof generationSchema>;
export type GenerationEvent = z.infer<typeof generationEventSchema>;
export type Deck = z.infer<typeof deckSchema>;

export function deckToCsv(deck: Deck) {
  const csvCell = (value: string) => {
    // Spreadsheet apps can execute cells starting with formula characters.
    const text = /^[\s\uFEFF]*[=+\-@]/u.test(value.normalize("NFKC")) ? "'" + value : value;
    return '"' + text.replaceAll('"', '""') + '"';
  };

  return [
    "Question,Answer,Difficulty",
    ...deck.flashcards.map(({ front, back, difficulty }) =>
      [front, back, difficultyLabels[difficulty]].map(csvCell).join(","),
    ),
  ].join("\r\n");
}
