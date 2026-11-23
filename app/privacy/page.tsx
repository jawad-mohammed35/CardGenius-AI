import type { Metadata } from "next";
import styles from "../components/account/account.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How CardGeniusAI handles study materials, account information, and browser storage.",
};

export default function PrivacyPage() {
  return (
    <article className={styles.policyLayout}>
      <header className={styles.pageHeading}>
        <h1>Privacy Policy</h1>
        <p>How CardGeniusAI handles your account and study materials.</p>
      </header>
      <div className={`panel ${styles.policyBody}`}>
        <section aria-labelledby="privacy-generation">
          <h2 id="privacy-generation">Flashcard generation</h2>
          <p>When you generate a deck, CardGeniusAI sends the submitted topics, notes, relevant PDFs and images, and text extracted from Word documents to Google&apos;s Gemini API. The application processes original files for the request. Generated cards are saved to your account when you choose to save a deck.</p>
          <p>CardGeniusAI stores short-lived generation counters to enforce a daily allowance. Hosted generation is for adults in the United States and Canada using it for professional learning or training.</p>
        </section>
        <section aria-labelledby="privacy-google">
          <h2 id="privacy-google">How Google handles submitted material</h2>
          <p>With unpaid Gemini API access, Google may use submitted material and generated responses to improve its services. Human reviewers may review this content. Keep personal, sensitive, and confidential material out of requests.</p>
          <p>The AI preview is for adults. Google sets rules for who can use Gemini and where apps built with the API can be offered. <a className={styles.inlineLink} href="https://ai.google.dev/gemini-api/terms">Gemini API terms</a> and <a className={styles.inlineLink} href="https://policies.google.com/privacy">Google Privacy Policy</a></p>
        </section>
        <section aria-labelledby="privacy-browser">
          <h2 id="privacy-browser">Data saved in this browser</h2>
          <p>Your current deck preview and guest library stay in this browser. If you import previous browser decks into an account, the originals stay in browser storage. Clearing this site&apos;s browser data removes browser-only copies and preferences.</p>
          <p>When signed in, your display name, resized avatar, appearance and study settings, saved decks, folders, and study progress are stored in Supabase. Copies you export or put on the clipboard are managed by your device.</p>
        </section>
        <section aria-labelledby="privacy-auth">
          <h2 id="privacy-auth">Accounts and deletion</h2>
          <p>Supabase Auth handles email addresses, password credentials, and login sessions. If you use Google sign-in, Supabase receives your basic Google profile information. Vercel hosts the application.</p>
          <p>In Account settings, you can export decks, clear the cloud library, or delete your account and associated profile, decks, and study progress. Older browser-only decks can be deleted using your browser controls.</p>
        </section>
      </div>
    </article>
  );
}
