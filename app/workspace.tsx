"use client";

import { BookOpen, ChevronDown, FileText, Image as ImageIcon, Info, Layers, LoaderCircle, Paperclip, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  acceptedFileTypes, attachmentKind, cardCounts, difficultyDescriptions, difficultyLabels,
  generationEventSchema, maxCardCount, maxFileBytes, maxFiles, maxTotalFileBytes, minNotesChars, minTopicChars,
  notesLimit, topicLimit, type Difficulty, type GenerationEvent,
} from "../lib/flashcards";
import { previewKey, previewSchema, storedJson, useStoredText, useStudyPreferences, writeStoredText } from "../lib/browser-settings";
import { useDeckScope } from "../lib/use-deck-library";
import { SaveDeck } from "./components/save-deck";
import { DeckView } from "./deck-view";

type Progress = Extract<GenerationEvent, { type: "progress" }>;
type GenerationResult = Extract<GenerationEvent, { type: "done" }>;

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function fileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1000))} KB`;
}

async function readGeneration(response: Response, onProgress: (event: Progress) => void): Promise<GenerationResult> {
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error : "The generator is temporarily unavailable. Try again.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The generator returned an empty response. Try again.");
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let result: GenerationResult | undefined;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      finished = done;
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event: GenerationEvent;
        try {
          event = generationEventSchema.parse(JSON.parse(line));
        } catch {
          throw new Error("The generator returned an unreadable response. Try again.");
        }
        if (event.type === "done") result = event;
        else if (event.type === "error") throw new Error(event.error);
        else if (!result) onProgress(event);
      }
      if (done) {
        if (!result) throw new Error("Generation ended before a deck arrived. Try again.");
        return result;
      }
    }
  } finally {
    if (!finished) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function Workspace({ hosted = false }: { hosted?: boolean }) {
  const scope = useDeckScope();
  return <CreationWorkspace key={scope} scope={scope} hosted={hosted} />;
}

function CreationWorkspace({ scope, hosted }: { scope: ReturnType<typeof useDeckScope>; hosted: boolean }) {
  const preferences = useStudyPreferences(scope);
  const key = previewKey(scope);
  const result = storedJson(useStoredText(key), previewSchema);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [difficultyOverride, setDifficulty] = useState<Difficulty>();
  const [sizeOverride, setSize] = useState<string>();
  const [customOverride, setCustomSize] = useState<string>();
  const [uploadHelp, setUploadHelp] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [uploadDismissed, setUploadDismissed] = useState(false);
  const difficulty = difficultyOverride ?? preferences.difficulty;
  const size = sizeOverride ?? (cardCounts.some((count) => count === preferences.count) ? String(preferences.count) : "custom");
  const customSize = customOverride ?? String(preferences.count);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const currentRequest = useRef<AbortController | null>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const deckHeadingRef = useRef<HTMLHeadingElement>(null);
  const busy = progress !== null;

  useEffect(() => () => currentRequest.current?.abort(), []);

  function addFiles(files: FileList) {
    const accepted = [...attachments];
    const keys = new Set(accepted.map(fileKey));
    let total = accepted.reduce((sum, file) => sum + file.size, 0);
    const rejected: string[] = [];
    for (const file of files) {
      const key = fileKey(file);
      if (keys.has(key)) continue;
      if (!attachmentKind(file.name)) {
        rejected.push(`${file.name}: choose PDF, DOCX, JPG, PNG, or WebP.`);
      } else if (file.size === 0 || file.size > maxFileBytes) {
        rejected.push(`${file.name}: files must be non-empty and at most ${fileSize(maxFileBytes)}.`);
      } else if (accepted.length === maxFiles || total + file.size > maxTotalFileBytes) {
        rejected.push(`${file.name}: add up to ${maxFiles} files totaling ${fileSize(maxTotalFileBytes)}.`);
      } else {
        accepted.push(file);
        keys.add(key);
        total += file.size;
      }
    }
    setAttachments(accepted);
    setAttachmentError(rejected.join(" "));
    setError("");
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) addFiles(event.dataTransfer.files);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentRequest.current) return;
    if (hosted && !eligible) {
      setError("Confirm your eligibility before generating cards.");
      return;
    }
    const selectedCount = Number(size === "custom" ? customSize : size);
    const cleanTopic = topic.trim();
    const cleanNotes = notes.trim();
    setAnnouncement("");
    if (cleanTopic && cleanTopic.length < minTopicChars) {
      setError(`Enter at least ${minTopicChars} characters for the topic.`);
      topicRef.current?.focus();
      return;
    }
    if (cleanNotes && cleanNotes.length < minNotesChars) {
      setShowNotes(true);
      setError(`Enter at least ${minNotesChars} characters for notes.`);
      return;
    }
    if (!cleanTopic && !cleanNotes && !attachments.length) {
      setError("Enter a topic, paste notes, or attach a file before generating.");
      topicRef.current?.focus();
      return;
    }
    if (!Number.isInteger(selectedCount) || selectedCount < 1 || selectedCount > maxCardCount) {
      setError(`Choose a whole number from 1 to ${maxCardCount}.`);
      return;
    }

    const controller = new AbortController();
    const timeout = AbortSignal.timeout(125_000);
    currentRequest.current = controller;
    const data = new FormData();
    data.set("topic", cleanTopic);
    data.set("notes", cleanNotes);
    data.set("difficulty", difficulty);
    data.set("count", String(selectedCount));
    for (const file of attachments) data.append("files", file);

    setError("");
    setProgress({ type: "progress", completed: 0, total: selectedCount, message: attachments.length ? "Uploading files…" : "Preparing your deck…" });
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { Accept: "application/x-ndjson", ...(eligible ? { "X-CardGenius-Adult-Training": "yes" } : {}) },
        body: data,
        signal: AbortSignal.any([controller.signal, timeout]),
      });
      const generated = await readGeneration(response, setProgress);
      if (controller.signal.aborted) return;
      writeStoredText(key, JSON.stringify({ deck: generated.deck, requested: selectedCount, subject: cleanTopic, message: generated.message, id: crypto.randomUUID() }));
      setAnnouncement(`${generated.deck.flashcards.length} flashcards ready.`);
      requestAnimationFrame(() => deckHeadingRef.current?.closest("section")?.querySelector<HTMLElement>(".deck-content")?.focus());
    } catch (error) {
      if (controller.signal.aborted) setAnnouncement("Generation canceled.");
      else if (timeout.aborted) setError("Generation timed out. Try a smaller deck or fewer source files.");
      else if (error instanceof TypeError) setError("Couldn’t reach the generator. Check your connection and try again.");
      else setError(error instanceof Error ? error.message : "Couldn’t generate a deck. Try again.");
    } finally {
      currentRequest.current = null;
      setProgress(null);
    }
  }

  return (
    <div className="workspace" id="workspace">
      <form className="creation-form" onSubmit={submit} noValidate>
        <section className="panel material-panel" aria-labelledby="material-title">
          <header className="panel-header">
            <span className="panel-icon"><FileText size={19} aria-hidden="true" /></span>
            <h2 id="material-title">Study material</h2>
          </header>
          <fieldset disabled={busy} className="material-fields">
            <legend className="sr-only">Sources for this deck</legend>
            <div>
              <label className="field-label" htmlFor="topic">Topic</label>
              <input
                ref={topicRef} id="topic" name="topic" type="text" value={topic} maxLength={topicLimit}
                placeholder="e.g., Introduction to Machine Learning"
                onChange={(event) => { setTopic(event.target.value); setError(""); }}
              />
            </div>
            <div className="notes-section">
              <button
                type="button" className="notes-trigger" aria-expanded={showNotes} aria-controls="notes-fields"
                onClick={() => setShowNotes(!showNotes)}
              >
                <FileText size={17} aria-hidden="true" />
                {showNotes ? "Study notes" : "Add study notes"}
                {notes.trim() && !showNotes ? <span className="notes-added">Added</span> : null}
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              <div id="notes-fields" className="notes-fields" hidden={!showNotes}>
                <label className="sr-only" htmlFor="notes">Study notes</label>
                <textarea id="notes" value={notes} maxLength={notesLimit} rows={5}
                  placeholder="Paste lecture notes, a summary, or a short excerpt…"
                  onChange={(event) => { setNotes(event.target.value); setError(""); }}
                />
                <div className="notes-actions">
                  <span>{notes.length.toLocaleString("en-US")} / {notesLimit.toLocaleString("en-US")}</span>
                </div>
              </div>
            </div>
            <div className="attachment-section">
              <input ref={filesRef} type="file" name="files" accept={acceptedFileTypes} multiple hidden
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <div className="upload-actions">
                <button
                type="button" className={`secondary-button${dragging ? " upload-hover" : ""}`}
                onClick={() => filesRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
                onDragLeave={(event) => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
                }}
                onDrop={handleDrop}
                ><Paperclip size={16} aria-hidden="true" /> Add Files</button>
                <div className="upload-help" data-dismissed={uploadDismissed}
                  onPointerLeave={() => setUploadDismissed(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") { setUploadHelp(false); setUploadDismissed(true); }
                  }}>
                  <button type="button" className="icon-button" aria-label="File upload limits" aria-describedby="upload-info"
                    aria-expanded={uploadHelp} onClick={() => { setUploadDismissed(uploadHelp); setUploadHelp(!uploadHelp); }}>
                    <Info size={17} aria-hidden="true" />
                  </button>
                  <div id="upload-info" className="upload-tip" data-open={uploadHelp}>
                    <strong>PDF, DOCX, PNG, JPG, JPEG, WebP</strong>
                    <p>Up to {maxFiles} files, {fileSize(maxFileBytes)} per file and {fileSize(maxTotalFileBytes)} total.</p>
                  </div>
                </div>
              </div>
              {attachments.length > 0 && (
                <ul className="attachment-list" aria-label="Attached files">
                  {attachments.map((file) => {
                    const kind = attachmentKind(file.name);
                    const Icon = /\.(png|jpe?g|webp)$/i.test(file.name) ? ImageIcon : Paperclip;
                    return (
                      <li key={fileKey(file)}>
                        <Icon size={17} aria-hidden="true" />
                        <span><strong>{file.name}</strong><small>{kind} · {fileSize(file.size)}</small></span>
                        <button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => {
                          setAttachments(attachments.filter((entry) => fileKey(entry) !== fileKey(file)));
                          setAttachmentError("");
                        }}><X size={16} aria-hidden="true" /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {attachmentError && <p className="form-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /> {attachmentError}</p>}
            </div>
          </fieldset>
        </section>
        <section className="panel settings-panel" aria-labelledby="settings-title">
          <header className="panel-header">
            <span className="panel-icon"><Layers size={19} aria-hidden="true" /></span>
            <h2 id="settings-title">Deck settings</h2>
          </header>
          <fieldset disabled={busy} className="settings-group">
            <legend className="field-label">Difficulty</legend>
            <div className="segmented difficulty-choices">
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="difficulty" value={value} checked={value === difficulty} onChange={() => setDifficulty(value as Difficulty)} />
                  {label}
                </label>
              ))}
            </div>
            <p className="option-description">{difficultyDescriptions[difficulty]}</p>
          </fieldset>
          <fieldset disabled={busy} className="settings-group">
            <legend className="field-label">Deck size</legend>
            <div className="segmented size-choices">
              {[...cardCounts.map(String), "custom"].map((value) => (
                <label key={value}>
                  <input type="radio" name="size" value={value} checked={value === size} onChange={() => { setSize(value); setError(""); }} />
                  {value === "custom" ? "Custom" : value}
                </label>
              ))}
            </div>
            {size === "custom" && (
              <div className="custom-size">
                <label className="field-label" htmlFor="custom-size">Number of cards</label>
                <input id="custom-size" type="number" min={1} max={maxCardCount} step={1}
                  value={customSize} onChange={(event) => { setCustomSize(event.target.value); setError(""); }}
                />
                <span>1–{maxCardCount}</span>
              </div>
            )}
          </fieldset>
          {hosted && <label className="deck-eligibility"><input type="checkbox" checked={eligible} onChange={(event) => {
            setEligible(event.target.checked); setError("");
          }} /> I am 18 or older and using CardGeniusAI for professional learning or training in the U.S. or Canada.</label>}
          {error && <p className="form-error" role="alert"><TriangleAlert size={17} aria-hidden="true" /> {error}</p>}
          {progress ? (
            <div className="generate-progress">
              <div>
                <p id="generation-progress" role="status">{progress.message ?? `Created ${progress.completed} of ${progress.total} cards…`}</p>
                <progress aria-labelledby="generation-progress" max={Math.max(1, progress.total)}
                  value={progress.completed > 0 ? progress.completed : undefined} />
              </div>
              <button type="button" className="secondary-button" onClick={() => currentRequest.current?.abort()}>Cancel</button>
            </div>
          ) : (
            <button className="primary-button generate" type="submit"><Layers size={18} aria-hidden="true" /> Generate flashcards</button>
          )}
          <p className="sr-only" role="status">{announcement}</p>
        </section>
      </form>

      <section className="panel deck-panel" id="deck" aria-labelledby="deck-heading">
        <header className="panel-header deck-header">
          <span className="panel-icon"><BookOpen size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="deck-heading" tabIndex={-1} ref={deckHeadingRef}>Deck preview</h2>
            {result && <p>{result.deck.title}</p>}
          </div>
          {busy && <LoaderCircle className="spinner preview-spinner" size={18} aria-hidden="true" />}
        </header>
        {result && result.deck.flashcards.length < result.requested && (
          <p className="deck-result-status">{result.deck.flashcards.length} of {result.requested} requested cards. {result.message ?? "Add more source material for a larger deck."}</p>
        )}
        {result ? (
          <>
            <DeckView key={result.id} deck={result.deck} initialSession={result.session}
              onSessionChange={(session) => writeStoredText(key, JSON.stringify({ ...result, session }))} />
            <div className="deck-save-row">
              <SaveDeck key={result.id} deck={result.deck} subject={result.subject} session={result.session} />
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <BookOpen size={26} aria-hidden="true" />
            <h3>{busy ? "Preparing your deck" : "Your cards will appear here"}</h3>
            <p>{busy ? "Follow the progress beside the deck settings." : "Add a topic, notes, or files to create your first deck."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
