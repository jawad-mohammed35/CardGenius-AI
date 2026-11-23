"use client";

import {
  Check, ChevronLeft, ChevronRight, Clipboard, Copy, Download, GalleryVerticalEnd, List, Maximize, Minimize, RotateCcw, Shuffle,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useStudyPreferences } from "../lib/browser-settings";
import { useDeckScope } from "../lib/use-deck-library";
import { deckToCsv, difficultyLabels, type Deck } from "../lib/flashcards";
import {
  createStudySession, rateCard, reviewMissedCards, shuffleStudySession, type CardRating, type StudySession,
} from "../lib/study-session";
import { DeckDialog } from "./components/deck-dialog";
import { StudyShortcuts } from "./components/study-shortcuts";
import fields from "./components/deck-dialog.module.css";
import styles from "./deck-view.module.css";

type DeckViewProps = {
  deck: Deck;
  initialSession?: StudySession | null;
  onSessionChange?: (session: StudySession) => void;
};

export function DeckView({ deck, initialSession, onSessionChange }: DeckViewProps) {
  const preferences = useStudyPreferences(useDeckScope());
  const [view, setView] = useState<"study" | "list">("study");
  const [revealed, setRevealed] = useState(false);
  const [session, setSession] = useState(() => initialSession ?? createStudySession(deck.flashcards.length));
  const [notice, setNotice] = useState("");
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fullDialog = useRef<HTMLDialogElement>(null);
  const enterButton = useRef<HTMLButtonElement>(null);
  const fullTitle = useId();
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const cardContentId = useId();
  const progressId = useId();
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
    setRevealed(false);
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
        event.metaKey || event.altKey || event.shiftKey || target.closest("input, textarea, select, [contenteditable]")) return;
    const dialog = target.closest("dialog");
    if (dialog && dialog !== fullDialog.current) return;
    const key = event.key.toLowerCase();
    if (key === " " && target.closest("a, button, summary") && !target.closest(".flashcard")) return;
    if (event.repeat && key !== "arrowleft" && key !== "arrowright") return;
    const studyActions: Record<string, () => void> = {
      arrowleft: () => move(-1), arrowright: () => move(1), " ": flipCard,
      arrowup: () => changeRating("known"), arrowdown: () => changeRating("review"),
      c: () => void copyText(`Q: ${card.front}\nA: ${card.back}`, "Card copied to clipboard."),
    };
    const shortcuts: Record<string, () => void> = {
      f: toggleFullscreen, s: shuffle, r: () => setConfirmRestart(true),
    };
    const action = shortcuts[key] ?? (view === "study" && !complete ? studyActions[key] : undefined);
    if (!action) return;
    event.preventDefault();
    action();
  }

  function flipCard() {
    setRevealed(!revealed);
    if (!revealed) onSessionChange?.(session);
  }

  function changeRating(rating: CardRating) {
    const next = rateCard(session, rating);
    const selected = next.ratings[index];
    setNotice(selected ? (selected === "known" ? "Marked known." : "Marked for review.") : "Rating cleared.");
    if (preferences.advance && selected && !next.complete && position < count - 1) {
      next.position++;
      setRevealed(false);
    }
    commit(next);
    if (next.complete) requestAnimationFrame(() => summaryHeading.current?.focus());
  }

  function shuffle() {
    if (count < 2) return;
    setView("study");
    setRevealed(false);
    commit(shuffleStudySession(session));
    setNotice("Cards shuffled.");
  }

  function restart() {
    setView("study");
    setRevealed(false);
    commit(createStudySession(cardCount));
    setConfirmRestart(false);
    setNotice("Study session restarted.");
  }

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
    <div className={`deck-content ${preferences.animate ? "" : styles.noMotion}`} role="region"
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
          <StudyShortcuts iconOnly />
          {!fullscreen && <button ref={enterButton} className="icon-button" type="button" aria-label="Enter Fullscreen" title="Enter Fullscreen" onClick={toggleFullscreen}>
            <Maximize size={17} aria-hidden="true" />
          </button>}
          {!fullscreen && <button className="icon-button" type="button" aria-label="Copy deck" title="Copy deck" onClick={copyDeck}>
            <Clipboard size={17} aria-hidden="true" />
          </button>}
          {!fullscreen && <button className="icon-button" type="button" aria-label="Download CSV" title="Download CSV" onClick={downloadDeck}>
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
                setRevealed(false);
                commit(reviewMissedCards(session));
              }}>Review missed cards</button>}
              <button type="button" className="secondary-button" onClick={() => setConfirmRestart(true)}>Restart session</button>
            </div>
          </div>
        ) : (
          <>
            <button
              className={`flashcard${revealed ? " flashcard-revealed" : ""}`}
              type="button"
              onClick={flipCard}
              aria-keyshortcuts="Space ArrowLeft ArrowRight ArrowUp ArrowDown C F S R"
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
              <span className="card-hint"><RotateCcw size={14} aria-hidden="true" /> {revealed ? "Show question" : "Reveal answer"}</span>
            </button>
            <div className={`study-actions ${styles.studyActions}`}>
              <div className="card-navigation">
                <button type="button" className="icon-button" aria-label="Previous card" onClick={() => move(-1)} disabled={position === 0}>
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
                <span className="card-position" role="status">{position + 1} / {count}</span>
                <button type="button" className="icon-button" aria-label="Next card" onClick={() => move(1)} disabled={position === count - 1}>
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
                <button className="icon-button" type="button" aria-label="Shuffle cards" title="Shuffle cards" onClick={shuffle} disabled={count < 2}>
                  <Shuffle size={16} aria-hidden="true" />
                </button>
                <button className="icon-button" type="button" aria-label="Copy current flashcard" title="Copy current flashcard"
                  onClick={() => void copyText(`Q: ${card.front}\nA: ${card.back}`, "Card copied to clipboard.")}>
                  <Copy size={16} aria-hidden="true" />
                </button>
              </div>
              <div role="group" aria-label="Rate this card" className={styles.ratings}>
                <button type="button" className={`secondary-button ${styles.reviewButton}`} aria-pressed={ratings[index] === "review"} onClick={() => changeRating("review")}>
                  <RotateCcw size={15} aria-hidden="true" /> Needs review
                </button>
                <button type="button" className="secondary-button learned-button" aria-pressed={ratings[index] === "known"} onClick={() => changeRating("known")}>
                  <Check size={16} aria-hidden="true" /> Known
                </button>
              </div>
            </div>
          </>
        )
      ) : (
        <ul className="card-list">
          {deck.flashcards.map(({ front, back, difficulty }, cardIndex) => (
            <li key={cardIndex}>
              <details>
                <summary>
                  <span className="list-number">{cardIndex + 1}</span>
                  <span>{front}</span>
                  {ratings[cardIndex] === "known" ? <Check size={16} aria-label="Known" />
                    : ratings[cardIndex] === "review" && <RotateCcw size={15} aria-label="Needs review" />}
                </summary>
                <p>{back}<small className={styles.listDifficulty}>{difficultyLabels[difficulty]}</small></p>
              </details>
            </li>
          ))}
        </ul>
      )}

      <div className="deck-progress">
        <label htmlFor={progressId}>{known + needsReview} of {cardCount} rated</label>
        <progress id={progressId} max={cardCount} value={known + needsReview} />
        {!complete && (
          <button type="button" className="text-button" onClick={() => setConfirmRestart(true)}>Restart</button>
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
          <h2 id={fullTitle}>{deck.title}</h2>
          <button className="secondary-button" type="button" aria-label="Exit Fullscreen" onClick={toggleFullscreen}
            onKeyDown={handleStudyKey}><Minimize size={17} aria-hidden="true" /> Exit fullscreen</button>
        </header>
        {content}
      </div>
    </dialog>
  ) : content;
}
