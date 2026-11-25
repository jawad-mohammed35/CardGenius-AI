import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/inter";
import { restoreAppearance } from "../lib/appearance";
import { CloudAccountProvider } from "../lib/cloud-account";
import { SiteNav } from "./site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CardGeniusAI | Flashcard Studio", template: "%s | CardGeniusAI" },
  description: "Turn topics, notes, documents, and images into flashcards. Organize decks and study at your own pace.",
  openGraph: {
    title: "CardGeniusAI | Flashcard Studio",
    description: "Create, organize, and study flashcards from your study materials.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: restoreAppearance }} /></head>
      <body>
        <CloudAccountProvider>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SiteNav />
        <main className="site-width app-main" id="main-content" tabIndex={-1}>{children}</main>
        <footer className="site-width site-footer">
          <span>CardGeniusAI by <a href="https://www.linkedin.com/in/jawad-mohammed01/" target="_blank" rel="noopener noreferrer">Jawad Mohammed</a></span>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <a href="https://github.com/jawad-mohammed35/CardGenius-AI">GitHub</a>
          </div>
        </footer>
        </CloudAccountProvider>
      </body>
    </html>
  );
}
