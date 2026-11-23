import { Buffer } from "node:buffer";
import { addAbortSignal, type Readable } from "node:stream";
import { SaxesParser } from "saxes";
import { fromBuffer } from "yauzl";
import { attachmentKind, maxFileBytes, maxFiles, maxTotalFileBytes } from "./flashcards.ts";
import { GenerationError } from "./generation-error.ts";

type MediaType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
export type SourcePart = { text: string } | { inlineData: { mimeType: MediaType; data: string } };

const maxWordEntries = 3_000;
const maxWordXmlBytes = 1_500_000;
const maxWordTextChars = 60_000;
const wordNamespaces = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

function displayName(file: File) {
  return file.name.replace(/\s+/g, " ").slice(0, 90);
}

export function validateAttachments(entries: FormDataEntryValue[]): File[] {
  if (entries.length > maxFiles) throw new GenerationError(`You can attach up to ${maxFiles} files at a time.`, 400);

  let totalBytes = 0;
  return entries.map((file) => {
    if (typeof file === "string") throw new GenerationError("Attach files using the file picker.", 400);
    if (!attachmentKind(file.name)) {
      throw new GenerationError(`“${displayName(file)}” is unsupported. Use a PDF, DOCX, JPEG, PNG, or WebP file.`, 415);
    }
    if (file.size === 0) throw new GenerationError(`“${displayName(file)}” is empty.`, 400);
    if (file.size > maxFileBytes) {
      throw new GenerationError(`“${displayName(file)}” exceeds the 2.5 MB per-file limit.`, 413);
    }
    totalBytes += file.size;
    if (totalBytes > maxTotalFileBytes) {
      throw new GenerationError("Attachments can be up to 3.5 MB combined. Remove a file and try again.", 413);
    }
    return file;
  });
}

async function collectWordXml(stream: Readable) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.from(value);
    size += chunk.length;
    if (size > maxWordXmlBytes) throw new Error("Document XML size exceeded");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function readWordXml(bytes: Buffer, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    fromBuffer(bytes, { lazyEntries: true, strictFileNames: true }, (openError, zip) => {
      if (openError) {
        reject(openError);
        return;
      }
      const fail = (error: Error) => {
        zip.close();
        reject(error);
      };
      zip.on("error", fail);
      zip.once("end", () => fail(new Error("Missing Word document XML")));
      if (signal.aborted) {
        fail(signal.reason);
        return;
      }
      if (zip.entryCount > maxWordEntries) {
        fail(new Error("Too many Word document parts"));
        return;
      }
      zip.on("entry", (entry) => {
        if (signal.aborted) {
          fail(signal.reason);
          return;
        }
        if (entry.fileName !== "word/document.xml") {
          zip.readEntry();
          return;
        }
        if (entry.isEncrypted() || entry.uncompressedSize > maxWordXmlBytes) {
          fail(new Error("Word document XML cannot be read"));
          return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            fail(streamError);
            return;
          }
          void collectWordXml(addAbortSignal(signal, stream)).then((xml) => {
            zip.close();
            resolve(xml);
          }, fail);
        });
      });
      zip.readEntry();
    });
  });
}

function extractWordText(xml: Buffer) {
  const encoding = xml[0] === 0xff && xml[1] === 0xfe ? "utf-16le"
    : xml[0] === 0xfe && xml[1] === 0xff ? "utf-16be"
    : "utf-8";
  const parser = new SaxesParser({ xmlns: true });
  let isWordDocument = false;
  let isTextRun = false;
  let length = 0;
  const parts: string[] = [];
  const append = (text: string) => {
    length += text.length;
    if (length > maxWordTextChars) throw new Error("Word document text limit exceeded");
    parts.push(text);
  };

  parser.on("doctype", () => { throw new Error("Unexpected document type"); });
  parser.on("opentag", ({ uri, local }) => {
    if (!wordNamespaces.has(uri)) return;
    if (local === "document") isWordDocument = true;
    if (local === "t") isTextRun = true;
    if (local === "tab") append("\t");
    if (local === "br" || local === "cr") append("\n");
  });
  parser.on("closetag", ({ uri, local }) => {
    if (!wordNamespaces.has(uri)) return;
    if (local === "t") isTextRun = false;
    if (local === "p") append("\n");
  });
  const readText = (text: string) => { if (isTextRun) append(text); };
  parser.on("text", readText);
  parser.on("cdata", readText);
  parser.write(new TextDecoder(encoding, { fatal: true }).decode(xml)).close();
  if (!isWordDocument) throw new Error("Missing Word document root");
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

function findMediaType(bytes: Buffer, kind: "PDF" | "Image"): MediaType | undefined {
  if (kind === "PDF") return bytes.subarray(0, 1_024).includes("%PDF-") ? "application/pdf" : undefined;

  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
}

export async function prepareStudySources(files: File[], signal: AbortSignal): Promise<SourcePart[]> {
  const sources: SourcePart[] = [];
  for (const [index, file] of files.entries()) {
    signal.throwIfAborted();
    const bytes = Buffer.from(await file.arrayBuffer());
    signal.throwIfAborted();
    const kind = attachmentKind(file.name);
    if (kind === "Word") {
      let wordText: string;
      try {
        const xml = await readWordXml(bytes, signal);
        signal.throwIfAborted();
        wordText = extractWordText(xml);
      } catch {
        signal.throwIfAborted();
        throw new GenerationError(`Couldn’t read “${displayName(file)}”. Open it in Word and save a smaller, unprotected DOCX copy.`, 422);
      }
      if (!wordText) {
        throw new GenerationError(`“${displayName(file)}” contains no readable Word text. Upload a PDF or image if the content is scanned.`, 422);
      }
      sources.push({ text: JSON.stringify({ source: index + 1, wordText }) });
      continue;
    }
    const mimeType = kind && findMediaType(bytes, kind);
    if (!mimeType) {
      throw new GenerationError(`“${displayName(file)}” doesn’t look like a readable PDF or supported image. Export a fresh copy and try again.`, 422);
    }
    sources.push({ inlineData: { mimeType, data: bytes.toString("base64") } });
  }
  return sources;
}
