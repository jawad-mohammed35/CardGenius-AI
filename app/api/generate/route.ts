import { Buffer } from "node:buffer";
import { isIP } from "node:net";
import { generationSchema, maxTotalFileBytes, type GenerationEvent, type GenerationInput } from "../../../lib/flashcards.ts";
import { GenerationError } from "../../../lib/generation-error.ts";
import { defaultModel, generateDeck } from "../../../lib/gemini.ts";
import { prepareStudySources, validateAttachments } from "../../../lib/study-material.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

const maxJsonBytes = 50_000;
const maxMultipartBytes = maxTotalFileBytes + 70_000;
const uploadDeadlineMs = 30_000;
const routeDeadlineMs = 115_000;
const windowMs = 60_000;
const requestsByClient = new Map<string, number>();
let windowEnds = 0;
let requestCount = 0;
let activeRequests = 0;

function errorResponse(message: string, status: number, retryAfter?: number) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return Response.json({ error: message }, { status, headers });
}

function rateLimit(request: Request) {
  const now = Date.now();
  if (now >= windowEnds) {
    windowEnds = now + windowMs;
    requestCount = 0;
    requestsByClient.clear();
  }

  // Vercel supplies the client IP. Self-hosted servers share one process-wide bucket.
  const forwardedIp = request.headers.get("x-forwarded-for")?.trim() ?? "";
  const client = process.env.VERCEL === "1" && isIP(forwardedIp) ? forwardedIp : "shared";
  const clientCount = requestsByClient.get(client) ?? 0;
  if (clientCount >= 5 || requestCount >= 15) return Math.ceil((windowEnds - now) / 1000);
  requestsByClient.set(client, clientCount + 1);
  requestCount++;
}

async function readRequestBody(request: Request, maxBodyBytes: number) {
  const tooLarge = () => new GenerationError("This request is too large. Shorten the study material or remove files.", 413);
  if (Number(request.headers.get("content-length")) > maxBodyBytes) {
    throw tooLarge();
  }

  const reader = request.body?.getReader();
  if (!reader) throw new GenerationError("Enter a topic, paste some notes, or add an attachment.", 400);
  const timeout = AbortSignal.timeout(uploadDeadlineMs);
  const signal = AbortSignal.any([request.signal, timeout]);
  const cancelRead = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancelRead, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        cancelRead();
        throw tooLarge();
      }
      chunks.push(value);
    }
    signal.throwIfAborted();
    return Buffer.concat(chunks, size);
  } catch (error) {
    if (timeout.aborted) throw new GenerationError("The upload timed out. Try a smaller file or a faster connection.", 408);
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelRead);
    reader.releaseLock();
  }
}

async function readSubmission(request: Request, contentType: string, multipart: boolean) {
  const body = await readRequestBody(request, multipart ? maxMultipartBytes : maxJsonBytes);
  let fields: unknown;
  let files: File[] = [];

  if (multipart) {
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "Content-Type": contentType } }).formData();
    } catch {
      throw new GenerationError("The upload could not be read. Select your files and try again.", 400);
    }
    const count = form.get("count");
    fields = {
      topic: form.get("topic") ?? undefined,
      notes: form.get("notes") ?? undefined,
      difficulty: form.get("difficulty") ?? undefined,
      count: typeof count === "string" && /^\d{1,3}$/.test(count) ? Number(count) : count ?? undefined,
    };
    files = validateAttachments(form.getAll("files"));
  } else {
    try {
      fields = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    } catch {
      throw new GenerationError("Send a valid JSON request with study material.", 400);
    }
  }

  const input = generationSchema.safeParse(fields);
  if (!input.success) {
    throw new GenerationError("Enter a topic of 3–160 characters, notes of 20–8,000 characters, and choose 1–100 cards and a valid difficulty.", 400);
  }
  if (!input.data.topic && !input.data.notes && !files.length) {
    throw new GenerationError("Enter a topic, paste some notes, or add an attachment.", 400);
  }
  return { input: input.data, files };
}

function remainingTime(deadline: number) {
  return Math.max(1, Math.floor(deadline - performance.now()));
}

function streamDeck(input: GenerationInput, files: File[], apiKey: string, model: string, requestSignal: AbortSignal, deadline: number) {
  const encoder = new TextEncoder();
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: GenerationEvent) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const run = async () => {
        let message: string | undefined;
        try {
          if (files.length) send({ type: "progress", completed: 0, total: input.count, message: "Processing attachments…" });
          const preparationTimeout = AbortSignal.timeout(remainingTime(deadline));
          const sources = await prepareStudySources(files, AbortSignal.any([signal, preparationTimeout]));
          send({ type: "progress", completed: 0, total: input.count, message: "Generating flashcards…" });
          const deck = await generateDeck(input, apiKey, model, signal, {
            sources,
            deadlineMs: remainingTime(deadline),
            onProgress: (completed) => send({ type: "progress", completed, total: input.count }),
            onWarning: (warning) => { message = warning; },
          });
          send({ type: "done", deck, message });
        } catch (error) {
          const problem = error instanceof GenerationError ? error.message
            : error instanceof DOMException && error.name === "TimeoutError" ? "Processing the attachments took too long. Try fewer or smaller files."
              : "Couldn’t generate a deck right now. Try again in a moment.";
          send({ type: "error", error: problem });
        } finally {
          activeRequests--;
          if (!cancellation.signal.aborted) controller.close();
        }
      };
      void run();
    },
    cancel(reason: unknown) {
      cancellation.abort(reason);
    },
  });
  return new Response(stream, { headers: {
    "Cache-Control": "no-store, no-transform",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next can construct the request URL using the server's bind hostname.
  const host = request.headers.get("host");
  const expectedOrigin = host ? `${requestUrl.protocol}//${host}` : requestUrl.origin;
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== expectedOrigin)) {
    return errorResponse("Generate cards from the CardGeniusAI workspace.", 403);
  }
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  const multipart = mediaType === "multipart/form-data";
  if (mediaType !== "application/json" && !multipart) {
    return errorResponse("Send study material as JSON or upload files from the workspace.", 415);
  }

  if (activeRequests >= 3) return errorResponse("The generator is busy. Try again in a few seconds.", 429, 5);
  const deadline = performance.now() + routeDeadlineMs;
  activeRequests++;
  let streamed = false;
  try {
    const hosted = process.env.VERCEL === "1" || process.env.HOSTED_GEMINI === "true";
    const reserve = hosted ? await (await import("../../../lib/hosted-generation")).verifyHostedGeneration(request) : null;
    const { input, files } = await readSubmission(request, contentType, multipart);
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === "your_gemini_api_key") {
      return errorResponse("AI generation needs a Gemini API key on the server.", 503);
    }
    const retryAfter = rateLimit(request);
    if (retryAfter !== undefined) {
      return errorResponse(`The generator has received several requests. Try again in ${retryAfter} seconds.`, 429, retryAfter);
    }
    if (reserve) await reserve(input.count);

    const model = process.env.GEMINI_MODEL?.trim() || defaultModel;
    if (multipart) {
      const response = streamDeck(input, files, apiKey, model, request.signal, deadline);
      streamed = true;
      return response;
    }
    const deck = await generateDeck(input, apiKey, model, request.signal, { deadlineMs: remainingTime(deadline) });
    return Response.json(deck, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GenerationError) return errorResponse(error.message, error.status, error.retryAfter);
    return errorResponse("Couldn’t generate a deck right now. Try again in a moment.", 500);
  } finally {
    if (!streamed) activeRequests--;
  }
}
