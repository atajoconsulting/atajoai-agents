import { Mistral } from "@mistralai/mistralai";
import { env } from "../../env";

export interface PdfExtractResult {
  text: string;
  title: string;
  pageCount: number;
}

const IMAGE_DESCRIBE_CONCURRENCY = 3;

const IMAGE_DESCRIBE_PROMPT =
  "Describe esta imagen de forma concisa en español. " +
  "Si es un gráfico o tabla, extrae los datos clave. " +
  "Si es un logo o elemento decorativo, di solo 'Imagen decorativa'. " +
  "Responde solo con la descripción, sin preámbulos.";

/**
 * Extracts text from a PDF buffer using Mistral OCR + vision.
 *
 * 1. mistral-ocr-latest extracts Markdown with image base64
 * 2. Each image is described by mistral-small-latest (vision)
 * 3. Image references in Markdown are replaced with text descriptions
 *
 * Requires MISTRAL_API_KEY in env.
 */
export async function extractPdfText(buffer: Buffer): Promise<PdfExtractResult> {
  if (!env.MISTRAL_API_KEY) {
    throw new Error(
      "MISTRAL_API_KEY is required for PDF extraction (mistral-ocr)",
    );
  }

  const client = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  const base64 = buffer.toString("base64");

  const response = await client.ocr.process({
    model: "mistral-ocr-latest",
    document: {
      type: "document_url",
      documentUrl: `data:application/pdf;base64,${base64}`,
    },
    includeImageBase64: true,
  });

  // Build a map of image ID → base64 across all pages
  const imageMap = new Map<string, string>();
  for (const page of response.pages) {
    for (const img of page.images) {
      if (img.imageBase64) {
        imageMap.set(img.id, img.imageBase64);
      }
    }
  }

  // Describe all images with vision, in batches
  const descriptionMap = await describeImages(client, imageMap);

  // Replace image references with descriptions in the Markdown
  const pageCount = response.pages.length;
  let text = response.pages.map((p) => p.markdown).join("\n\n");

  text = text.replace(/!\[([^\]]*)\]\(([^)]*)\)\n?/g, (_match, _alt, src) => {
    // src can be the image ID or a filename — try both
    const description = descriptionMap.get(src) ?? descriptionMap.get(_alt);
    if (description) {
      return `[Imagen: ${description}]\n`;
    }
    // No description available — remove the reference
    return "";
  });

  text = text.trim();

  // Try to extract title from first heading in Markdown
  const headingMatch = text.match(/^#{1,3}\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() ?? "";

  return { text, title, pageCount };
}

async function describeImages(
  client: Mistral,
  imageMap: Map<string, string>,
): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();
  const entries = [...imageMap.entries()];

  for (let i = 0; i < entries.length; i += IMAGE_DESCRIBE_CONCURRENCY) {
    const batch = entries.slice(i, i + IMAGE_DESCRIBE_CONCURRENCY);

    const results = await Promise.all(
      batch.map(async ([id, base64Data]) => {
        try {
          // Detect mime type from base64 header or default to png
          let dataUrl = base64Data;
          if (!dataUrl.startsWith("data:")) {
            dataUrl = `data:image/png;base64,${dataUrl}`;
          }

          const response = await client.chat.complete({
            model: "mistral-small-latest",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: IMAGE_DESCRIBE_PROMPT },
                  { type: "image_url", imageUrl: { url: dataUrl } },
                ],
              },
            ],
            maxTokens: 200,
          });

          const text =
            response.choices?.[0]?.message?.content?.toString().trim() ?? "";
          return { id, description: text };
        } catch {
          return { id, description: "" };
        }
      }),
    );

    for (const { id, description } of results) {
      if (description && !isDecorativeDescription(description)) {
        descriptions.set(id, description);
      }
    }
  }

  return descriptions;
}

function isDecorativeDescription(description: string): boolean {
  const normalized = description.toLowerCase().replace(/[.\s]+$/g, "").trim();
  return normalized === "imagen decorativa";
}
