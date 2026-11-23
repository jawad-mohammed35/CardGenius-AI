import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { POST } from "../app/api/generate/route.ts";
import { generationEventSchema, maxFileBytes, maxTotalFileBytes } from "../lib/flashcards.ts";
import { GenerationError } from "../lib/generation-error.ts";
import { prepareStudySources, validateAttachments } from "../lib/study-material.ts";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GEMINI_API_KEY;
const xmlStart = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>';
const xmlEnd = "</w:body></w:document>";

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

function wordFile(xml: string) {
  const data = Buffer.from(xml);
  const compressed = deflateRawSync(data);
  const name = Buffer.from("word/document.xml");
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt32LE(crc32(data), 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50);
  localHeader.copy(centralHeader, 6, 4, 30);
  const directoryOffset = localHeader.length + name.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralHeader.length + name.length, 12);
  end.writeUInt32LE(directoryOffset, 16);
  return new File([Buffer.concat([localHeader, name, compressed, centralHeader, name, end])], "notes.docx");
}

function request(form: FormData) {
  return new Request("http://localhost:3000/api/generate", {
    method: "POST",
    headers: { Accept: "application/x-ndjson", Origin: "http://localhost:3000" },
    body: form,
  });
}

test("validates attachment types and combined and individual size limits", () => {
  assert.throws(() => validateAttachments([new File(["content"], "notes.svg")]), (error: unknown) =>
    error instanceof GenerationError && error.status === 415);
  assert.throws(() => validateAttachments([new File([], "notes.pdf")]), /empty/);
  assert.throws(() => validateAttachments([new File([new Uint8Array(maxFileBytes + 1)], "notes.pdf")]), /per-file limit/);
  const first = new File([new Uint8Array(maxFileBytes)], "notes.pdf");
  const second = new File([new Uint8Array(maxTotalFileBytes - maxFileBytes + 1)], "notes.png");
  assert.throws(() => validateAttachments([first, second]), /combined/);
  assert.throws(() => validateAttachments(Array.from({ length: 6 }, () => first)), /up to 5 files/);
});

test("extracts Word text without sending the archive and rejects empty, malformed and oversized Word content", async () => {
  const signal = new AbortController().signal;
  const file = wordFile(xmlStart + "<w:p><w:r><w:t>Learning &amp; memory</w:t></w:r></w:p><w:p><w:r><w:t>Review regularly.</w:t></w:r></w:p>" + xmlEnd);
  const parts = await prepareStudySources([file], signal);
  assert.deepEqual(parts, [{ text: JSON.stringify({ source: 1, wordText: "Learning & memory\nReview regularly." }) }]);
  await assert.rejects(prepareStudySources([wordFile(xmlStart + xmlEnd)], signal), /no readable Word text/);
  await assert.rejects(prepareStudySources([new File(["x"], "fake.docx")], signal), /Couldn’t read/);
  await assert.rejects(prepareStudySources([wordFile(xmlStart + "<w:p><w:r><w:t>" + "x".repeat(65_000) + "</w:t></w:r></w:p>" + xmlEnd)], signal), /smaller/);
});

test("validates bytes and forwards PDF and image sources with their detected media types", async () => {
  const signal = new AbortController().signal;
  const pdf = new File(["%PDF-1.5"], "notes.PDF");
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "notes.png");
  const jpg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "notes.jpg");
  const webp = new File(["RIFF0000WEBP"], "notes.webp");
  const parts = await prepareStudySources([pdf, png, jpg, webp], signal);
  assert.deepEqual(parts.map((part) => "inlineData" in part && part.inlineData.mimeType), [
    "application/pdf", "image/png", "image/jpeg", "image/webp",
  ]);
  await assert.rejects(prepareStudySources([new File(["x"], "fake.pdf")], signal), /readable PDF/);
});

test("starts streaming before Gemini completes and sends combined sources to Gemini", async () => {
  process.env.GEMINI_API_KEY = "synthetic-fixture-key";
  const gate = Promise.withResolvers<void>();
  const form = new FormData();
  form.set("topic", "Learning strategies");
  form.set("notes", "Practice retrieval using review questions.");
  form.set("count", "1");
  form.set("difficulty", "expert");
  form.append("files", wordFile(xmlStart + "<w:p><w:r><w:t>Spacing makes review more effective.</w:t></w:r></w:p>" + xmlEnd));
  form.append("files", new File(["%PDF-1.5"], "notes.pdf"));
  let sentBody: unknown;
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(String(options?.body));
    await gate.promise;
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({
      title: "Learning strategies",
      flashcards: [{ front: "What makes review more effective?", back: "Spacing out practice." }],
    }) }] } }] });
  };
  const response = await POST(request(form));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /x-ndjson/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const first = await reader.read();
  const progress = generationEventSchema.parse(JSON.parse(decoder.decode(first.value).trim()));
  assert.deepEqual(progress, { type: "progress", completed: 0, total: 1, message: "Processing attachments…" });
  gate.resolve();
  const chunks: string[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(decoder.decode(next.value, { stream: true }));
  }
  chunks.push(decoder.decode());
  const events = chunks.join("").trim().split("\n").map((line) => generationEventSchema.parse(JSON.parse(line)));
  assert.deepEqual(events.map(({ type }) => type), ["progress", "progress", "done"]);
  assert.equal(events[2].type === "done" && events[2].deck.flashcards[0].difficulty, "expert");
  const serialized = JSON.stringify(sentBody);
  assert.match(serialized, /Learning strategies/);
  assert.match(serialized, /Practice retrieval/);
  assert.match(serialized, /Spacing makes review/);
  assert.match(serialized, /application\/pdf/);
  assert.doesNotMatch(serialized, /notes\.docx|notes\.pdf/);
});

test("reports multipart validation errors before the stream", async () => {
  const form = new FormData();
  form.set("topic", "Learning");
  form.set("count", "1e2");
  const invalidCount = await POST(request(form));
  assert.equal(invalidCount.status, 400);
  form.set("count", "5");
  form.append("files", new File(["content"], "fake.txt"));
  const unsupported = await POST(request(form));
  assert.equal(unsupported.status, 415);
  assert.match(await unsupported.text(), /unsupported/);
});

test("limits concurrent request bodies and releases admission on upload cancellation", async () => {
  const controllers = Array.from({ length: 3 }, () => new AbortController());
  let cancelledBodies = 0;
  const pending = controllers.map(({ signal }) => {
    const options: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=study-material" },
      body: new ReadableStream({ cancel: () => { cancelledBodies++; } }),
      signal,
      duplex: "half",
    };
    return POST(new Request("http://localhost:3000/api/generate", options));
  });
  try {
    const busy = await POST(request(new FormData()));
    assert.equal(busy.status, 429);
    assert.equal(busy.headers.get("Retry-After"), "5");
  } finally {
    for (const controller of controllers) controller.abort();
    await Promise.all(pending);
  }
  assert.equal(cancelledBodies, 3);
  const afterCancellation = await POST(request(new FormData()));
  assert.equal(afterCancellation.status, 400);
});

test("canceling the progress stream cancels the in-flight Gemini request", async () => {
  process.env.GEMINI_API_KEY = "synthetic-fixture-key";
  const providerStarted = Promise.withResolvers<void>();
  const providerAborted = Promise.withResolvers<void>();
  globalThis.fetch = async (_url, options) => {
    const signal = options?.signal;
    assert.ok(signal);
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        providerAborted.resolve();
        reject(signal.reason);
      }, { once: true });
      providerStarted.resolve();
    });
  };
  const form = new FormData();
  form.set("topic", "Learning strategies");
  const response = await POST(request(form));
  await providerStarted.promise;
  await response.body!.cancel();
  await providerAborted.promise;
});
