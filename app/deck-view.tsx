"use client";

import {
  Check, ChevronLeft, ChevronRight, Clipboard, Copy, Download, GalleryVerticalEnd, List, Maximize, Minimize, RotateCcw, Shuffle,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { defaultStudyPreferences, useStudyPreferences, type StudyPreferences } from "../lib/browser-settings";
import { useCloudAccount } from "../lib/cloud-account";
import { useDeckScope } from "../lib/use-deck-library";
import { deckToCsv, difficultyLabels, type Deck } from "../lib/flashcards";
import {
  createStudySession, rateStudyCard, reviewMissedCards, shuffleStudySession, type CardRating, type StudySession,
} from "../lib/study-session";
import { playRatingSound } from "../lib/study-audio";
import { shortcutFromEvent, studyActionIds, type StudyAction } from "../lib/study-shortcuts";
import { DeckDialog } from "./components/deck-dialog";
import { ShortcutKey, StudyShortcuts } from "./components/study-shortcuts";
import fields from "./components/deck-dialog.module.css";
import styles from "./deck-view.module.css";

type DeckViewProps = {
  deck: Deck;
  initialSession?: StudySession | null;
  onSessionChange?: (session: StudySession) => void;
  identity?: React.ReactNode;
};

export function DeckView(props: DeckViewProps) {
  const scope = useDeckScope();
  const preferences = useStudyPreferences(scope);
  const { ready, profileReady } = useCloudAccount();
  if (!ready || !profileReady) return <p role="status">Loading study preferences…</p>;
  return <FlashcardStudy key={scope} {...props} preferences={preferences} />;
}

function startSession(count: number, shuffle: boolean) {
  const session = createStudySession(count);
  return shuffle ? shuffleStudySession(session) : session;
}

type SessionOptions = Pick<StudyPreferences, "advance" | "animate" | "confirmRestart" | "shuffleOnStart" |
  "startingSide" | "showHints" | "sounds" | "volume" | "shortcuts">;

export function FlashcardStudy({ deck, identity, initialSession, onSessionChange, preferences, exportEnabled = true }:
  DeckViewProps & { preferences?: Partial<SessionOptions>; exportEnabled?: boolean }) {
  const { advance, animate, confirmRestart: confirmOnRestart, shuffleOnStart, startingSide, showHints, sounds, volume, shortcuts } = {
    ...defaultStudyPreferences, ...preferences,
  };
  const startsRevealed = startingSide === "answer";
  const [view, setView] = useState<"study" | "list">("study");
  const [flipped, setFlipped] = useState(false);
  const revealed = startsRevealed !== flipped;
  const [answers, setAnswers] = useState<Set<number>>(() => new Set());
  const [session, setSession] = useState(() => initialSession ?? startSession(deck.flashcards.length, shuffleOnStart));
  const [notice, setNotice] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fullDialog = useRef<HTMLDialogElement>(null);
  const enterButton = useRef<HTMLButtonElement>(null);
  const fullTitle = useId();
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const cardContentId = useId();
  const progressId = useId();
  const lastRating = useRef(-Infinity);
  const cardCount = deck.flashcards.length;
  const { order, position, ratings, complete } = session;
  const count = order.length;
  const index = order[position];
  const card = deck.flashcards[index];
  const known = Object.values(ratings).filter((rating) => rating === "known").length;
  const needsReview = Object.values(ratings).filter((rating) => rating === "review").length;

  useEffect(() => {
    if (!fullscreen) return;
    const dialog = fullDialog.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLButtonElement>(".flashcard")?.focus();
    return () => { dialog?.close(); };
  }, [fullscreen]);

  function commit(next: StudySession) {
    setSession(next);
    onSessionChange?.(next);
  }

  function move(step: number) {
    const next = position + step;
    if (next < 0 || next >= count) return;
    setFlipped(false);
    commit({ ...session, position: next });
  }

  function toggleFullscreen() {
    if (fullscreen) fullDialog.current?.close();
    else { setView("study"); setFullscreen(true); }
  }

  function closeFullscreen() {
    setFullscreen(false);
    requestAnimationFrame(() => enterButton.current?.focus({ preventScroll: true }));
  }

  function handleStudyKey(event: KeyboardEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || event.defaultPrevented || event.nativeEvent.isComposing || event.ctrlKey ||
        target.closest("input, textarea, select, [contenteditable], [role=combobox], [role=listbox]")) return;
    const dialog = target.closest("dialog");
    if (dialog && dialog !== fullDialog.current) return;
    const key = shortcutFromEvent(event.nativeEvent);
    if (key === "Space" && target.closest("a, button, summary") && !target.closest(".flashcard")) return;
    const action = studyActionIds.find((id) => shortcuts[id] === key);
    if (!action || (action === "copy" && !exportEnabled)) return;
    if ((view !== "study" || complete) && !["fullscreen", "shuffle", "restart"].includes(action)) return;
    const handlers: Record<StudyAction, () => void> = {
      previous: () => move(-1), next: () => move(1), flip: flipCard,
      known: () => changeRating("known", event.timeStamp), review: () => changeRating("review", event.timeStamp),
      copy: () => void copyText(`Q: ${card.front}\nA: ${card.back}`, "Card copied to clipboard."),
      fullscreen: toggleFullscreen, shuffle, restart: requestRestart,
    };
    event.preventDefault();
    if (!event.repeat || action === "previous" || action === "next") handlers[action]();
  }

  function flipCard() {
    setFlipped(!flipped);
    if (!revealed) onSessionChange?.(session);
  }

  function changeRating(rating: CardRating, now: number) {
    if (advance && now - lastRating.current < 350) return;
    lastRating.current = now;
    const next = rateStudyCard(session, rating, advance);
    const selected = next.ratings[index];
    setNotice(selected ? (selected === "known" ? "Marked known." : "Marked for review.") : "Rating cleared.");
    if (selected && sounds) void playRatingSound(selected, volume);
    if (next.position !== position) setFlipped(false);
    commit(next);
    if (next.complete) requestAnimationFrame(() => summaryHeading.current?.focus());
  }

  function shuffle() {
    if (count < 2) return;
    setView("study");
    setFlipped(false);
    commit(shuffleStudySession(session));
    setNotice("Cards shuffled.");
  }

  function restart() {
    setView("study");
    setFlipped(false);
    lastRating.current = -Infinity;
    commit(startSession(cardCount, shuffleOnStart));
    setConfirmRestart(false);
    setNotice("Study session restarted.");
  }

  function requestRestart() {
    if (confirmOnRestart) setConfirmRestart(true);
    else restart();
  }

  function hint(action: StudyAction) {
    return showHints && <ShortcutKey binding={shortcuts[action]} hint />;
  }

  const allAnswers = answers.size === cardCount;

  async function copyText(text: string, message: string) {
    setNotice("");
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setNotice("Clipboard access is unavailable. You can download the CSV instead.");
    }
  }

  function copyDeck() {
    const text = deck.flashcards.map(({ front, back }) => `Q: ${front}\nA: ${back}`).join("\n\n");
    void copyText(`${deck.title}\n\n${text}`, "Deck copied to clipboard.");
  }

  function downloadDeck() {
    const csv = new Blob(["\uFEFF", deckToCsv(deck)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(csv);
    const link = document.createElement("a");
    const filename = deck.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 75);
    link.href = url;
    link.download = `${filename || "flashcards"}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("CSV download started.");
  }

  const content = (
    <div className={`deck-content ${animate ? "" : styles.noMotion}`} role="region"
      aria-label="Flashcard study" tabIndex={0} onKeyDown={handleStudyKey}>
      <div className="deck-toolbar">
        <div className="view-switch" role="group" aria-label="Deck view">
          <button type="button" aria-pressed={view === "study"} onClick={() => setView("study")}>
            <GalleryVerticalEnd size={15} aria-hidden="true" /> Study
          </button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List size={17} aria-hidden="true" /> All cards
          </button>
        </div>
        <div className={styles.tools} role="group" aria-label="Study tools">
          {view === "list" && <button className="secondary-button" type="button" onClick={() =>
            setAnswers(allAnswers ? new Set() : new Set(deck.flashcards.map((_, index) => index)))}>
            <RotateCcw size={15} aria-hidden="true" /> {allAnswers ? "Show questions" : "Show answers"}
          </button>}
          <StudyShortcuts bindings={shortcuts} exportEnabled={exportEnabled} />
          {!fullscreen && <button ref={enterButton} className="icon-button" type="button" aria-label="Enter Fullscreen"
            title="Enter Fullscreen" aria-keyshortcuts={shortcuts.fullscreen} onClick={toggleFullscreen}>
            <Maximize size={17} aria-hidden="true" />{hint("fullscreen")}
          </button>}
          {!fullscreen && exportEnabled && <button className="icon-button" type="button" aria-label="Copy deck" title="Copy deck" onClick={copyDeck}>
            <Clipboard size={17} aria-hidden="true" />
          </button>}
          {!fullscreen && exportEnabled && <button className="icon-button" type="button" aria-label="Download CSV" title="Download CSV" onClick={downloadDeck}>
            <Download size={18} aria-hidden="true" />
          </button>}
        </div>
      </div>

      {view === "study" ? (
        complete ? (
          <div className={styles.summary}>
            <span className={styles.finishedIcon}><Check size={23} aria-hidden="true" /></span>
            <h3 ref={summaryHeading} tabIndex={-1}>Session complete</h3>
            <p>{known} known · {needsReview} to review</p>
            <div>
              {needsReview > 0 && <button type="button" className="primary-button" onClick={() => {
                setFlipped(false);
                lastRating.current = -Infinity;
                commit(reviewMissedCards(session));
              }}>Review missed cards</button>}
              <button type="button" className="secondary-button" aria-keyshortcuts={shortcuts.restart} onClick={requestRestart}>Restart session{hint("restart")}</button>
            </div>
          </div>
        ) : (
          <>
            <button
              className={`flashcard${revealed ? " flashcard-revealed" : ""}`}
              type="button"
              onClick={flipCard}
              aria-keyshortcuts={shortcuts.flip}
              aria-label={revealed ? "Show question" : "Reveal answer"}
              aria-describedby={cardContentId}
            >
              <span className="card-topline">
                <span className="card-face">{revealed ? "Answer" : "Question"}</span>
                <span className="difficulty-tag">{difficultyLabels[card.difficulty]}</span>
              </span>
              <span id={cardContentId} className="card-text" aria-live="polite">
                <span key={`${index}:${revealed}`} className={styles.cardFace}>{revealed ? card.back : card.front}</span>
              </span>
              <span className="card-hint"><RotateCcw size={14} aria-hidden="true" /> {revealed ? "Show question" : "Reveal answer"}{hint("flip")}</span>
            </button>
            <div className={`study-actions ${styles.studyActions}`}>
              <div className="card-navigation">
                <button type="button" className="icon-button" aria-label="Previous card" aria-keyshortcuts={shortcuts.previous} onClick={() => move(-1)} disabled={position === 0}>
                  <ChevronLeft size={20} aria-hidden="true" />{hint("previous")}
                </button>
                <span className="card-position" role="status">{position + 1} / {count}</span>
                <button type="button" className="icon-button" aria-label="Next card" aria-keyshortcuts={shortcuts.next} onClick={() => move(1)} disabled={position === count - 1}>
                  <ChevronRight size={20} aria-hidden="true" />{hint("next")}
                </button>
                <button className="icon-button" type="button" aria-label="Shuffle cards" title="Shuffle cards" aria-keyshortcuts={shortcuts.shuffle} onClick={shuffle} disabled={count < 2}>
                  <Shuffle size={16} aria-hidden="true" />{hint("shuffle")}
                </button>
                {exportEnabled && <button className="icon-button" type="button" aria-label="Copy current flashcard" title="Copy current flashcard"
                  aria-keyshortcuts={shortcuts.copy} onClick={() => void copyText(`Q: ${card.front}\nA: ${card.back}`, "Card copied to clipboard.")}>
                  <Copy size={16} aria-hidden="true" />{hint("copy")}
                </button>}
              </div>
              <div role="group" aria-label="Rate this card" className={styles.ratings}>
                <button type="button" className={`secondary-button ${styles.reviewButton}`} aria-pressed={ratings[index] === "review"} aria-keyshortcuts={shortcuts.review} onClick={(event) => changeRating("review", event.timeStamp)}>
                  <RotateCcw size={15} aria-hidden="true" /> Needs review{hint("review")}
                </button>
                <button type="button" className="secondary-button learned-button" aria-pressed={ratings[index] === "known"} aria-keyshortcuts={shortcuts.known} onClick={(event) => changeRating("known", event.timeStamp)}>
                  <Check size={16} aria-hidden="true" /> Known{hint("known")}
                </button>
              </div>
            </div>
          </>
        )
      ) : (
        <ul className="card-list">
          {deck.flashcards.map(({ front, back, difficulty }, cardIndex) => {
            const answer = answers.has(cardIndex);
            return <li key={cardIndex}>
              <button className={styles.listCard} type="button" aria-pressed={answer} onClick={() => setAnswers((previous) => {
                const next = new Set(previous);
                if (next.has(cardIndex)) next.delete(cardIndex);
                else next.add(cardIndex);
                return next;
              })}>
                <span className="list-number">{cardIndex + 1}</span>
                <span key={String(answer)} className={styles.cardFace}>
                  <span className={styles.listDifficulty}>{answer ? "Answer" : "Question"} · {difficultyLabels[difficulty]}</span>{answer ? back : front}
                </span>
                {ratings[cardIndex] === "known" ? <Check size={16} aria-label="Known" />
                  : ratings[cardIndex] === "review" && <RotateCcw size={15} aria-label="Needs review" />}
                <RotateCcw className={styles.listFlip} size={15} aria-hidden="true" />
              </button>
            </li>;
          })}
        </ul>
      )}

      <div className="deck-progress">
        <label htmlFor={progressId}>{known + needsReview} of {cardCount} rated</label>
        <progress id={progressId} max={cardCount} value={known + needsReview} />
        {!complete && (
          <button type="button" className={`text-button ${styles.restart}`} aria-keyshortcuts={shortcuts.restart} onClick={requestRestart}>Restart{hint("restart")}</button>
        )}
      </div>
      <p role="status" className={notice ? "deck-notice" : "sr-only"}>{notice}</p>
      {confirmRestart && (
        <DeckDialog title="Restart this session?" onClose={() => setConfirmRestart(false)} onSubmit={(event) => {
          event.preventDefault();
          restart();
        }} pending={false} submitLabel="Restart session">
          <p className={fields.description}>Start again with all cards and clear the current ratings.</p>
        </DeckDialog>
      )}
    </div>
  );

  return fullscreen ? (
    <dialog ref={fullDialog} className={styles.fullscreen} aria-labelledby={fullTitle}
      onKeyDown={(event) => { if (event.target === event.currentTarget) handleStudyKey(event); }}
      onClose={(event) => { if (event.target === event.currentTarget) closeFullscreen(); }}>
      <div className={styles.fullscreenInner}>
        <header>
          <h2 id={fullTitle}>{identity}{deck.title}</h2>
          <button className="secondary-button" type="button" aria-label="Exit Fullscreen" aria-keyshortcuts={`${shortcuts.fullscreen} Escape`} onClick={toggleFullscreen}
            onKeyDown={handleStudyKey}><Minimize size={17} aria-hidden="true" /> Exit fullscreen
            {showHints && <ShortcutKey binding="Escape" hint />}{hint("fullscreen")}</button>
        </header>
        {content}
      </div>
    </dialog>
  ) : content;
}
