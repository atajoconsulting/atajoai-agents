import { CrawledPage } from "../web-indexer";
import { RagDocument, ragDocumentSchema } from "./schemas";

export function toRagDocument(page: CrawledPage): RagDocument {
  const sourceLang = page.detectedLang ?? "es";

  return ragDocumentSchema.parse({
    id: page.id,
    title: page.title,
    content: page.text,
    translatedContent: page.translatedText,
    lang: sourceLang,
    source: page.url,
    sourceType: "web",
    contentHash: page.contentHash,
    metadata: {
      httpStatus: page.httpStatus,
      crawledAt: page.crawledAt.toISOString(),
      indexedLang: page.translatedText ? "es" : sourceLang,
    },
    indexedAt: new Date(),
  });
}
