import { Atom, BookOpen, BriefcaseBusiness, Calculator, Code, Globe, HeartPulse, Landmark, Languages, Layers, Leaf, Palette } from "lucide-react";
import { defaultDeckAppearance, type DeckAppearance } from "../../lib/deck-appearance";

export const deckIconChoices = {
  layers: { icon: Layers, label: "Default" },
  science: { icon: Atom, label: "Science" },
  technology: { icon: Code, label: "Technology" },
  math: { icon: Calculator, label: "Mathematics" },
  languages: { icon: Languages, label: "Languages" },
  history: { icon: Landmark, label: "History" },
  medicine: { icon: HeartPulse, label: "Medicine" },
  business: { icon: BriefcaseBusiness, label: "Business" },
  nature: { icon: Leaf, label: "Nature" },
  arts: { icon: Palette, label: "Arts" },
  geography: { icon: Globe, label: "Geography" },
  books: { icon: BookOpen, label: "Studying" },
};

export function DeckIcon({ appearance = defaultDeckAppearance, size = 19 }: { appearance?: DeckAppearance; size?: number }) {
  const Icon = deckIconChoices[appearance.icon].icon;
  return <span className="deck-emblem" data-color={appearance.color} aria-hidden="true"><Icon size={size} /></span>;
}
