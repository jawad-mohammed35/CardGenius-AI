import type { Metadata } from "next";
import { DeckDetail } from "./deck-detail";

export const metadata: Metadata = {
  title: "Study Deck",
  robots: { index: false, follow: false },
};

export default async function StudyDeckPage({ params, searchParams }: PageProps<"/study-decks/[id]">) {
  const [{ id }, { view }] = await Promise.all([params, searchParams]);
  return <DeckDetail id={id} editing={view === "edit"} />;
}
