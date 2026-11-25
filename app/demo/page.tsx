import type { Metadata } from "next";
import { Demo } from "./demo";

export const metadata: Metadata = {
  title: "Interactive demo",
  description: "Try creating, reviewing, and organizing a sample flashcard deck in CardGeniusAI.",
};

export default function DemoPage() {
  return <Demo />;
}
