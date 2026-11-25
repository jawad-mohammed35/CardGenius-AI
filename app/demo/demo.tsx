"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, FileImage, FileText, Folder, Layers, Paperclip, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Accent, Theme } from "../../lib/appearance";
import { difficultyLabels, type Deck, type Difficulty } from "../../lib/flashcards";
import type { StudySession } from "../../lib/study-session";
import { AppearanceChoices } from "../appearance-control";
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

export function Demo() {
  const [step, setStep] = useState(0);
  const [skipFrom, setSkipFrom] = useState<number | null>(null);
  const [source, setSource] = useState<"topic" | "notes">("topic");
  const [topic, setTopic] = useState(sampleTopic);
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(5);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [session, setSession] = useState<StudySession | null>(null);
  const [saved, setSaved] = useState(false);
  const [folder, setFolder] = useState("");
  const [inFolder, setInFolder] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [accent, setAccent] = useState<Accent>("monochrome");
  const [advance, setAdvance] = useState(false);
  const [animate, setAnimate] = useState(true);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const lastStep = steps.length - 1;
  const [material, setMaterial] = useState("");

  useEffect(() => { if (step > 0) stageHeading.current?.focus(); }, [step]);

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = source === "topic" ? topic.trim() : notes.trim();
    if (!selected && !files.length) { setMaterial("Enter a topic, paste notes, or attach a sample file."); return; }
    setDeck({ title: sampleTopic, flashcards: sampleCards.slice(0, count).map((card) => ({ ...card, difficulty })) });
    setMaterial("");
    setSession(null);
    setSaved(false);
    setInFolder(false);
    setStep(1);
  }

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
    <div className={`panel ${styles.stage}`}>
      {step === 0 && <form className={styles.stageStack} onSubmit={generate}>
        <h2 ref={stageHeading} tabIndex={-1}>Set up a deck</h2>
        <div className={styles.creation}>
          <section className={styles.stack} aria-label="Sample study material">
            <div className="view-switch" role="group" aria-label="Source type">
              <button type="button" aria-pressed={source === "topic"} onClick={() => setSource("topic")}>Topic</button>
              <button type="button" aria-pressed={source === "notes"} onClick={() => setSource("notes")}>Pasted notes</button>
            </div>
            {source === "topic" ? <label className={styles.field}>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={160} /></label>
              : <label className={styles.field}>Study notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={8000} /></label>}
            {source === "notes" && !notes && <button className="text-button" type="button" onClick={() => setNotes(sampleNotes)}>Use sample notes</button>}
            <fieldset className={styles.files}>
              <legend><Paperclip size={15} aria-hidden="true" /> Attach sample files</legend>
              {sampleFiles.map(({ name, format, icon: Icon }) => <label className={styles.file} key={name}>
                <input type="checkbox" checked={files.includes(name)} onChange={(event) => {
                  setFiles(event.target.checked ? [...files, name] : files.filter((file) => file !== name));
                }} />
                <Icon size={17} aria-hidden="true" />
                <span>{name}</span><small>{format}</small>
              </label>)}
            </fieldset>
          </section>
          <section className={styles.options} aria-label="Demo deck settings">
            <h3><Layers size={18} aria-hidden="true" /> Deck settings</h3>
            <label className={styles.field}>Difficulty
              <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                {Object.entries(difficultyLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className={styles.field}>Deck size
              <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
                {[3, 5, 8].map((size) => <option key={size} value={size}>{size} cards</option>)}
              </select>
            </label>
            <p>The demo uses prepared cards about meeting agendas. The full app generates cards from your own material.</p>
          </section>
        </div>
        {material && <p className="form-error" role="alert">{material}</p>}
        <div><button type="submit" className="primary-button"><Sparkles size={16} aria-hidden="true" /> Generate sample deck</button></div>
      </form>}
      {step === 1 && deck && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>{deck.title}</h2>
        <p>Flip a card, rate your recall, or try fullscreen. Open Keyboard shortcuts for the study controls.</p>
        <FlashcardStudy deck={deck} initialSession={session} onSessionChange={setSession} advance={advance} animate={animate} exportEnabled={false} />
      </div>}
      {step === 2 && deck && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>Organize your decks</h2>
        <p>Try saving the sample, renaming it, and moving it into a folder.</p>
        <div className={styles.library}>
          <div className={styles.options}>
            <h3><Folder size={18} aria-hidden="true" /> Folders</h3>
            {folder ? <p>{folder}</p> : <form className={styles.stack} onSubmit={(event) => {
              event.preventDefault();
              setFolder(String(new FormData(event.currentTarget).get("folder") ?? "").trim());
            }}>
              <label className={styles.field}>Folder name<input name="folder" required maxLength={60} defaultValue="Work skills" /></label>
              <button type="submit" className="secondary-button">Create sample folder</button>
            </form>}
          </div>
          <div className={styles.options}>
            <h3><BookOpen size={18} aria-hidden="true" /> Sample deck</h3>
            <p>{deck.flashcards.length} cards{saved ? ` · ${inFolder ? folder : "Unfiled"}` : ""}</p>
            {saved ? <>
              <label className={styles.field}>Deck name<input value={deck.title} maxLength={100}
                onChange={(event) => setDeck({ ...deck, title: event.target.value })} onBlur={() => {
                  if (!deck.title.trim()) setDeck({ ...deck, title: sampleTopic });
                }} /></label>
              <label className={styles.field}>Move to folder
                <select value={inFolder ? "folder" : "unfiled"} onChange={(event) => setInFolder(event.target.value === "folder")}>
                  <option value="unfiled">Unfiled</option>
                  {folder && <option value="folder">{folder}</option>}
                </select>
              </label>
              <button type="button" className="text-button" onClick={() => { setSaved(false); setInFolder(false); }}>Remove from demo library</button>
            </> : <button type="button" className="secondary-button" onClick={() => setSaved(true)}>Save sample deck</button>}
          </div>
        </div>
        <p className="sr-only" role="status">{saved ? "Sample deck saved in this demo." : ""}</p>
      </div>}
      {step === 3 && <div className={styles.stageStack}>
        <h2 ref={stageHeading} tabIndex={-1}>Make it yours</h2>
        <p>Try your appearance and study preferences here, then go back to see how automatic advance feels.</p>
        <div className={styles.personalize}>
          <section className={`demo-appearance ${styles.options}`} data-theme={theme} data-accent={accent} aria-label="Demo appearance">
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
      {step > 0 && <button type="button" className="secondary-button" onClick={() => { setStep(skipFrom ?? step - 1); setSkipFrom(null); }}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
      {step < lastStep && <button type="button" className="text-button" onClick={() => { setSkipFrom(step); setStep(lastStep); }}>Skip demo</button>}
      {step > 0 && step < lastStep && <button type="button" className="primary-button" onClick={() => setStep(step + 1)}>Next <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
  </section>;
}
