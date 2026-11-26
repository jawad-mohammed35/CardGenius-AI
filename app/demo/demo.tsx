"use client";

import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, FileImage, FileText, Folder, Layers, Paperclip, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Accent, Theme } from "../../lib/appearance";
import { difficultyLabels, type Deck, type Difficulty } from "../../lib/flashcards";
import type { StudySession } from "../../lib/study-session";
import { AppearanceChoices } from "../appearance-control";
import { AccentSelect } from "../components/accent-select";
import { FlashcardStudy } from "../deck-view";
import styles from "./demo.module.css";

const steps = ["Create", "Study", "Organize", "Personalize", "Finish"] as const;
const sampleTopic = "Effective meeting agendas";
const sampleNotes = "Write a clear outcome, set time limits for each topic, and share the agenda in advance. Finish by recording owners and due dates for each action item.";
const sampleFiles = [
  { name: "Agenda guide.pdf", format: "PDF", icon: FileText },
  { name: "Meeting notes.docx", format: "Word", icon: FileText },
  { name: "Action items.png", format: "Image", icon: FileImage },
];
const sampleCards = [
  { front: "What is the first thing to define when writing an agenda?", back: "The intended outcome. It tells participants what the meeting needs to accomplish." },
  { front: "Why should an agenda include time limits?", back: "Time limits make priorities visible and keep one topic from taking over the meeting." },
  { front: "When should you share a meeting agenda?", back: "Share it in advance so participants can prepare, read materials, and raise questions." },
  { front: "What makes an action item easy to follow up on?", back: "A clear task, one responsible owner, and a specific due date." },
  { front: "How can you handle an important topic that is outside the agenda?", back: "Record it for a follow-up and return to the current discussion." },
  { front: "How does a decision item differ from an update?", back: "A decision item calls for a choice. An update shares information without requiring a decision." },
  { front: "Why assign a discussion lead to an agenda item?", back: "The lead can prepare the context, guide the discussion, and bring it to a clear outcome." },
  { front: "What should you review before ending a meeting?", back: "Confirm decisions, action owners, deadlines, and any topics that need a follow-up." },
];
const sampleDifficulty: Difficulty = "medium";
const sampleDeck: Deck = { title: sampleTopic, flashcards: sampleCards.map((card) => ({ ...card, difficulty: sampleDifficulty })) };

function Callout({ children }: { children: string }) {
  return <p className={styles.callout}><ArrowUp size={14} aria-hidden="true" />{children}</p>;
}

export function Demo() {
  const [step, setStep] = useState(0);
  const [deck, setDeck] = useState(sampleDeck);
  const [session, setSession] = useState<StudySession | null>(null);
  const [saved, setSaved] = useState(false);
  const [folder, setFolder] = useState("");
  const [inFolder, setInFolder] = useState(false);
  const [folderView, setFolderView] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState<Accent>("monochrome");
  const [advance, setAdvance] = useState(true);
  const [animate, setAnimate] = useState(true);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const lastStep = steps.length - 1;
  const navigationStarted = useRef(false);
  useEffect(() => {
    if (navigationStarted.current || step > 0) stageHeading.current?.focus();
    if (step > 0) navigationStarted.current = true;
  }, [step]);

  return <section className={styles.demo} aria-labelledby="demo-title">
    <header className={styles.header}>
      <div>
        <h1 id="demo-title">Try CardGeniusAI</h1>
        <p>Create, study, and organize a sample deck. Your changes stay in this demo.</p>
      </div>
      <Link href="/" className="secondary-button"><X size={16} aria-hidden="true" /> Close demo</Link>
    </header>
    <ol className={styles.steps} aria-label="Demo progress">
      {steps.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} data-finished={index < step || undefined}>{label}</li>)}
    </ol>
    <div className={`panel demo-appearance ${styles.stage}`} data-theme={theme} data-accent={accent}>
      {step === 0 && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>Set up a deck</h2>
        <p>See what goes into the sample deck, then study the cards it produces.</p>
        <div className={styles.creation}>
          <section className={styles.stack} aria-label="Sample study material">
            <div>
              <label className={styles.field}>Topic<input value={sampleTopic} readOnly tabIndex={-1} /></label>
              <Callout>Enter any subject you want to study.</Callout>
            </div>
            <div>
              <label className={styles.field}>Study notes<textarea value={sampleNotes} readOnly tabIndex={-1} rows={4} /></label>
              <Callout>Paste your own notes to turn them into flashcards.</Callout>
            </div>
            <div className={styles.files}>
              <h3><Paperclip size={15} aria-hidden="true" /> Add files</h3>
              {sampleFiles.map(({ name, format, icon: Icon }) => <div className={styles.file} key={name}>
                <Icon size={17} aria-hidden="true" />
                <span>{name}</span><small>{format}</small>
              </div>)}
              <Callout>Upload PDFs, Word documents, and images as study material.</Callout>
            </div>
          </section>
          <section className={styles.options} aria-label="Demo deck settings">
            <h3><Layers size={18} aria-hidden="true" /> Deck settings</h3>
            <div>
              <label className={styles.field}>Difficulty<input value={difficultyLabels[sampleDifficulty]} readOnly tabIndex={-1} /></label>
              <Callout>Choose how complex your questions and answers should be.</Callout>
            </div>
            <div>
              <label className={styles.field}>Deck size<input value={`${sampleDeck.flashcards.length} cards`} readOnly tabIndex={-1} /></label>
              <Callout>Generate up to 100 flashcards in a deck.</Callout>
            </div>
          </section>
        </div>
      </div>}
      {step === 1 && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>{deck.title}</h2>
        <p>Flip a card, rate your recall, or try fullscreen. Open Keyboard shortcuts for the study controls.</p>
        <FlashcardStudy deck={deck} initialSession={session} onSessionChange={setSession} preferences={{ advance, animate }} exportEnabled={false} />
      </div>}
      {step === 2 && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>Organize your decks</h2>
        <p>Try saving the sample, renaming it, and moving it into a folder.</p>
        <div className={styles.library}>
          <div className={styles.options}>
            <h3><Folder size={18} aria-hidden="true" /> Folders</h3>
            <button className="secondary-button" type="button" aria-pressed={!folderView} onClick={() => setFolderView(false)}><Layers size={16} aria-hidden="true" /> All decks</button>
            {folder ? <button className={`secondary-button ${styles.folderButton}`} type="button" aria-pressed={folderView}
              onClick={() => setFolderView(true)}><Folder size={16} aria-hidden="true" /><span>{folder}</span><small>{saved && inFolder ? 1 : 0}</small></button> : <form className={styles.stack} onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("folder") ?? "").trim();
              if (!name) { setFolderError("Enter a folder name."); return; }
              setFolder(name);
              setFolderError("");
            }}>
              <label className={styles.field}>Folder name<input name="folder" required maxLength={60} defaultValue="Work skills" /></label>
              {folderError && <p className="form-error" role="alert">{folderError}</p>}
              <button type="submit" className="secondary-button">Create sample folder</button>
            </form>}
          </div>
          <div className={styles.options}>
            <h3><BookOpen size={18} aria-hidden="true" /> {folderView ? folder : "Sample deck"}</h3>
            {folderView && (!saved || !inFolder) ? <p>This folder is empty. Move the sample deck here from All decks.</p> : <>
              <p className={styles.sampleTitle}>{deck.title || sampleTopic}</p>
              <div className={styles.deckMeta}><span>{deck.flashcards.length} cards</span>
                {saved && <span><Folder size={14} aria-hidden="true" /> {inFolder ? folder : "Unfiled"}</span>}</div>
              {saved ? <>
              <label className={styles.field}>Deck name<input value={deck.title} maxLength={100}
                onChange={(event) => setDeck({ ...deck, title: event.target.value })} onBlur={() => {
                  setDeck({ ...deck, title: deck.title.trim() || sampleTopic });
                }} /></label>
              {folder && <div className={styles.field}><AccentSelect label="Move to folder" value={inFolder ? "folder" : "unfiled"}
                options={[{ value: "unfiled", label: "Unfiled" }, { value: "folder", label: folder }]}
                onChange={(value) => setInFolder(value === "folder")} /></div>}
              <button type="button" className="text-button" onClick={() => { setSaved(false); setInFolder(false); }}>Remove from demo library</button>
              </> : <button type="button" className="secondary-button" onClick={() => setSaved(true)}>Save sample deck</button>}
            </>}
          </div>
        </div>
        <p className="sr-only" role="status">{saved ? `Sample deck saved in ${inFolder ? folder : "Unfiled"}.` : ""}</p>
      </div>}
      {step === 3 && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>Make it yours</h2>
        <p>Try your appearance and study preferences here, then go back to see how automatic advance feels.</p>
        <div className={styles.personalize}>
          <section className={styles.options} aria-label="Demo appearance">
            <AppearanceChoices theme={theme} accent={accent} onTheme={setTheme} onAccent={setAccent} />
            <p className={styles.accentPreview}><Check size={16} aria-hidden="true" /> Study preview</p>
          </section>
          <fieldset className={styles.options}>
            <legend className="sr-only">Demo study preferences</legend>
            <h3>Study preferences</h3>
            <label className={styles.preference}><input type="checkbox" checked={advance} onChange={(event) => setAdvance(event.target.checked)} /> Advance after rating a card</label>
            <label className={styles.preference}><input type="checkbox" checked={animate} onChange={(event) => setAnimate(event.target.checked)} /> Animate card flips</label>
          </fieldset>
        </div>
      </div>}
      {step === lastStep && <div className={styles.finish}>
        <span className={styles.finishIcon}><Sparkles size={22} aria-hidden="true" /></span>
        <h2 ref={stageHeading} tabIndex={-1}>Ready to study your own material?</h2>
        <p>Create an account to generate your own cards, organize decks, and sync your study progress.</p>
        <Link href="/sign-up" className="primary-button">Create an account <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>}
    </div>
    <div className={styles.navigation}>
      {step > 0 && <button type="button" className="secondary-button" onClick={() => setStep(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Previous</button>}
      {step < lastStep && <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>
        {step === 0 ? "Generate sample deck" : "Next"}{step === 0 ? <Sparkles size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
      </button>}
    </div>
  </section>;
}
