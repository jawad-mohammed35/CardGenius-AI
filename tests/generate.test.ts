import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { POST } from "../app/api/generate/route.ts";
import { cardCounts, deckToCsv, generationSchema } from "../lib/flashcards.ts";
import { defaultModel, generateDeck, GenerationError } from "../lib/gemini.ts";

const key = "fixture-credential";
const topic = generationSchema.parse({ topic: "  Photosynthesis  " });
const mockCard = { front: "What captures light?", back: "Chlorophyll" };
const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

function modelResponse(value: unknown, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

function callGemini() {
  return generateDeck(topic, key, defaultModel, new AbortController().signal);
}

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

test("validates sources, difficulty and custom sizes and accepts the legacy topic request", () => {
  assert.deepEqual(topic, { topic: "Photosynthesis", difficulty: "medium", count: 10 });
  assert.equal(generationSchema.safeParse({ mode: "notes", notes: "short notes" }).success, false);
  assert.equal(generationSchema.safeParse({ mode: "notes", notes: "a".repeat(8_001) }).success, false);
  assert.equal(generationSchema.safeParse({ mode: "notes", notes: "These are long enough study notes.", count: 6, difficulty: "hard" }).success, true);
  assert.equal(generationSchema.parse({ topic: "   " }).topic, undefined);
  assert.equal(generationSchema.safeParse({ topic: "Biology", count: 50, difficulty: "expert" }).success, true);
  assert.equal(generationSchema.safeParse({ topic: "Biology", count: 101, difficulty: "easy" }).success, false);
  assert.equal(generationSchema.safeParse({ topic: "Biology", count: 3.5, difficulty: "easy" }).success, false);
  assert.equal(generationSchema.safeParse({ topic: "Biology", count: 1, difficulty: "expert" }).success, true);
});

test("requests structured output and normalizes duplicated questions", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel}:generateContent`);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.ok(payload.generationConfig.responseJsonSchema.properties.flashcards.maxItems <= 10);
    assert.equal(JSON.parse(payload.contents[0].parts[0].text).topic, "Photosynthesis");
    return modelResponse({ title: "Plants", flashcards: [mockCard, { ...mockCard, front: "WHAT captures light" }] });
  };
  assert.deepEqual(await callGemini(), { title: "Plants", flashcards: [{ ...mockCard, difficulty: "medium" }] });
});

test("handles empty, blocked, invalid and truncated Gemini results", async () => {
  const cases: [() => Response, number][] = [
    [() => modelResponse({ title: "Plants", flashcards: [] }), 422],
    [() => Response.json({ promptFeedback: { blockReason: "SAFETY" } }), 422],
    [() => modelResponse({ title: "Plants", flashcards: [{ front: "", back: "Empty question" }] }), 502],
    [() => modelResponse({ title: "Plants", flashcards: [mockCard] }, "MAX_TOKENS"), 502],
    [() => new Response("invalid json"), 502],
  ];
  for (const [response, status] of cases) {
    globalThis.fetch = async () => response();
    await assert.rejects(callGemini, (error: unknown) => error instanceof GenerationError && error.status === status);
  }
});

test("returns sanitized errors for provider failures and preserves a quota retry hint", async () => {
  globalThis.fetch = async () => new Response(key, { status: 403 });
  await assert.rejects(callGemini, (error: unknown) =>
    error instanceof GenerationError && error.status === 502 && !error.message.includes(key));
  globalThis.fetch = async () => new Response(null, { status: 429, headers: { "Retry-After": "12" } });
  await assert.rejects(callGemini, (error: unknown) => error instanceof GenerationError && error.status === 429 && error.retryAfter === 12);
  globalThis.fetch = async () => { throw new Error("Connection lost"); };
  await assert.rejects(callGemini, (error: unknown) => error instanceof GenerationError && error.status === 502);
});

test("retries a transient transport failure once", async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts++;
    if (attempts === 1) throw new TypeError("Connection interrupted");
    return modelResponse({ title: "Plants", flashcards: [mockCard] });
  };
  const input = generationSchema.parse({ topic: "Photosynthesis", count: 1 });
  const result = await generateDeck(input, key, defaultModel, new AbortController().signal);
  assert.equal(result.flashcards.length, 1);
  assert.equal(attempts, 2);
});

test("retries a temporary HTTP outage without increasing the batch allowance", async () => {
  let attempts = 0;
  globalThis.fetch = async () => ++attempts === 1
    ? new Response(null, { status: 503 })
    : modelResponse({ title: "Plants", flashcards: [mockCard] });
  const input = generationSchema.parse({ topic: "Photosynthesis", count: 1 });
  const result = await generateDeck(input, key, defaultModel, new AbortController().signal);
  assert.equal(result.flashcards.length, 1);
  assert.equal(attempts, 2);
});

test("handles interruption without returning provider details", async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async (_url, init) => {
    init?.signal?.throwIfAborted();
    throw new Error("The aborted signal did not reach fetch");
  };
  await assert.rejects(generateDeck(topic, key, defaultModel, controller.signal),
    (error: unknown) => error instanceof GenerationError && error.status === 504);
});

test("applies the request budget to an in-flight provider fetch", async () => {
  globalThis.fetch = async (_url, init) => {
    await setTimeout(1_000, undefined, { signal: init?.signal ?? undefined });
    throw new Error("The generation deadline should cancel the request first");
  };
  await assert.rejects(generateDeck(topic, key, defaultModel, new AbortController().signal, { deadlineMs: 5 }),
    (error: unknown) => error instanceof GenerationError && error.status === 504);
});

test("rejects invalid HTTP requests and reports a missing API key", async () => {
  delete process.env.GEMINI_API_KEY;
  const body = JSON.stringify({ topic: "Rivers" });
  assert.equal((await POST(request(body, { Origin: "https://example.org" }))).status, 403);
  assert.equal((await POST(request(body, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await POST(request("{"))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ topic: " " })))).status, 400);
  assert.equal((await POST(request(JSON.stringify({ mode: "notes", notes: "x".repeat(50_000) })))).status, 413);
  assert.equal((await POST(request(body))).status, 503);
});

test("returns a valid deck and limits bursts per process", async () => {
  process.env.GEMINI_API_KEY = key;
  let upstreamRequests = 0;
  globalThis.fetch = async () => {
    upstreamRequests++;
    return modelResponse({ title: "Plants", flashcards: [mockCard] });
  };
  const body = JSON.stringify({ topic: "Biology", count: 1 });
  for (let index = 0; index < 5; index++) {
    const response = await POST(request(body, { Origin: "http://localhost:3000" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { title: "Plants", flashcards: [{ ...mockCard, difficulty: "medium" }] });
  }
  const throttled = await POST(request(body));
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get("Retry-After")) > 0);
  assert.equal(upstreamRequests, 5);
});

test("quotes CSV fields and neutralizes formulas", () => {
  const csv = deckToCsv({
    title: "Questions",
    flashcards: [{ front: "Text, with \"quotes\"", back: "＝1+1\nsecond line", difficulty: "easy" }],
  });
  assert.equal(csv, "Question,Answer,Difficulty\r\n\"Text, with \"\"quotes\"\"\",\"'＝1+1\nsecond line\",\"Beginner\"");
});

test("applies every difficulty and preserves the selected difficulty on cards", async () => {
  for (const [difficulty, title, guidance] of [
    ["easy", "Beginner", "introductory"],
    ["medium", "Intermediate", "practical applications"],
    ["hard", "Advanced", "deeper reasoning"],
    ["expert", "Expert", "complex problem-solving"],
  ]) {
    globalThis.fetch = async (_url, options) => {
      const requestBody = JSON.parse(String(options?.body));
      const prompt = JSON.parse(requestBody.contents[0].parts[0].text);
      assert.equal(prompt.difficulty, title);
      assert.ok(prompt.difficultyGuidance.includes(guidance));
      assert.match(requestBody.systemInstruction.parts[0].text, /Apply the specified difficulty/);
      return modelResponse({ title: "Learning", flashcards: [mockCard] });
    };
    const input = generationSchema.parse({ topic: "Learning", difficulty, count: 1 });
    const deck = await generateDeck(input, key, defaultModel, new AbortController().signal);
    assert.equal(deck.flashcards[0].difficulty, difficulty);
  }
});

test("generates a 100-card deck in bounded batches and excludes previous questions", async () => {
  let batches = 0;
  const progress: number[] = [];
  globalThis.fetch = async (_url, options) => {
    const requestBody = JSON.parse(String(options?.body));
    const prompt = JSON.parse(requestBody.contents[0].parts[0].text);
    assert.equal(prompt.earlierQuestions.length, batches * 25);
    assert.equal(prompt.requestedCards, 25);
    const flashcards = Array.from({ length: 25 }, (_, index) => ({
      front: `Question ${batches * 25 + index + 1}`,
      back: "An answer",
    }));
    batches++;
    return modelResponse({ title: "A large deck", flashcards });
  };
  const input = generationSchema.parse({ topic: "General knowledge", count: 100, difficulty: "expert" });
  const deck = await generateDeck(input, key, defaultModel, new AbortController().signal, { onProgress: (completed) => progress.push(completed) });
  assert.equal(new Set(deck.flashcards.map(({ front }) => front)).size, 100);
  assert.deepEqual(progress, [25, 50, 75, 100]);
  assert.equal(batches, 4);
});

test("honors every deck size preset", async () => {
  assert.deepEqual(cardCounts, [5, 10, 15, 20]);
  for (const count of cardCounts) {
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(String(options?.body));
      assert.equal(payload.generationConfig.responseJsonSchema.properties.flashcards.maxItems, count);
      const flashcards = Array.from({ length: count }, (_, index) => ({ front: `Question ${index + 1}`, back: "An answer" }));
      return modelResponse({ title: "Study material", flashcards });
    };
    const input = generationSchema.parse({ topic: "Study material", count });
    const deck = await generateDeck(input, key, defaultModel, new AbortController().signal);
    assert.equal(deck.flashcards.length, count);
  }
});

test("preserves finished cards if Gemini reaches quota during a later batch", async () => {
  let calls = 0;
  const warnings: string[] = [];
  globalThis.fetch = async () => ++calls === 1
    ? modelResponse({ title: "Plants", flashcards: [mockCard] })
    : new Response(null, { status: 429 });
  const input = generationSchema.parse({ topic: "Biology", count: 30 });
  const deck = await generateDeck(input, key, defaultModel, new AbortController().signal, { onWarning: (warning) => warnings.push(warning) });
  assert.deepEqual(deck.flashcards, [{ ...mockCard, difficulty: "medium" }]);
  assert.match(warnings[0], /quota/);
  assert.equal(calls, 2);
});
