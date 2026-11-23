import type { Metadata } from "next";
import { StudyLibrary } from "./study-library";

export const metadata: Metadata = {
  title: "Study Decks",
  description: "Find, organize, and study the flashcard decks saved in your browser.",
};

export default function StudyDecksPage() {
  return <StudyLibrary />;
}
