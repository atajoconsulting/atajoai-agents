import { createRequire } from "node:module";
import { Mistral } from "@mistralai/mistralai";

const require = createRequire(import.meta.url);
// pdf-parse is CommonJS — must be required, not imported, in an ESM context
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
import { env } from "@atajoai/shared";

export interface PdfExtractResult {
  text: string;
  title: string;
  pageCount: number;
  /** Whether OCR was used (true = scanned PDF) */
  usedOcr: boolean;
}

/** Min average characters per page to consider a PDF as text-based (not scanned) */
const MIN_CHARS_PER_PAGE = 100;

/**
 * Extracts text from a PDF buffer.
 *
 * Strategy:
 * 1. Try pdf-parse (fast, works on text-based PDFs)
 * 2. If text is too sparse (scanned PDF), fall back to Mistral OCR
 *
 * Requires MISTRAL_API_KEY in env for OCR fallback.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  const data = await pdfParse(buffer);
  const title = (data.info?.Title as string | undefined) ?? "";
  const pageCount = data.numpages;
  const text = data.text.trim();

  const charsPerPage = text.length / Math.max(pageCount, 1);
  const isScanned = charsPerPage < MIN_CHARS_PER_PAGE;

  if (!isScanned) {
    return { text, title, pageCount, usedOcr: false };
  }

  // Scanned PDF — use Mistral OCR
  if (!env.MISTRAL_API_KEY) {
    process.stderr.write(
      `[pdf-extractor] WARNING: Scanned PDF detected (${charsPerPage.toFixed(0)} chars/page) but MISTRAL_API_KEY is not set. ` +
        `Indexing with sparse text — search recall will be degraded.\n`,
    );
    return { text, title, pageCount, usedOcr: false };
  }

  const ocrText = await runMistralOcr(buffer);
  return { text: ocrText, title, pageCount, usedOcr: true };
}

async function runMistralOcr(buffer: Buffer): Promise<string> {
  const client = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  const base64 = buffer.toString("base64");

  const response = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64}`,
    },
    includeImageBase64: false,
  });

  return response.pages.map((p) => p.markdown).join("\n\n");
}
