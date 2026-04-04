import { createStep, createWorkflow } from "@mastra/core/workflows";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { z } from "zod";
import { extractPdfText } from "../lib/document-extractor/pdf-extractor";
import { extractDocxText } from "../lib/document-extractor/docx-extractor";
import {
  documentIndexerInputSchema,
  documentIndexerOutputSchema,
} from "../lib/document-extractor";
import { fileToRagDocument, indexDocuments } from "../lib/rag";
import type { RagDocument } from "../lib/rag";
import { detectLang } from "../lib/language";
import { env } from "@atajoai/shared";

export { documentIndexerInputSchema, documentIndexerOutputSchema };

const extractedDocSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      filePath: z.string(),
      source: z.string(),
      text: z.string(),
      title: z.string(),
      sourceType: z.enum(["pdf", "docx", "txt"]),
      lang: z.string().optional(),
    }),
  ),
});

const extractText = createStep({
  id: "extract-text",
  description: "Extracts plain text from PDF, DOCX, and TXT files",
  inputSchema: documentIndexerInputSchema,
  outputSchema: extractedDocSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const documents: z.infer<typeof extractedDocSchema>["documents"] = [];

    for (const file of inputData.files) {
      try {
        const buffer = Buffer.from(file.content, "base64");
        let text = "";
        let extractedTitle =
          file.title ?? file.fileName.replace(/\.[^.]+$/, "");

        switch (file.type) {
          case "pdf": {
            const result = await extractPdfText(buffer);
            text = result.text;
            if (result.title) extractedTitle = result.title;
            logger.info(
              `Extracted ${text.length} chars from PDF "${file.fileName}" (${result.pageCount} pages)`,
            );
            break;
          }
          case "docx": {
            const result = await extractDocxText(buffer);
            text = result.text;
            logger.info(
              `Extracted ${text.length} chars from DOCX "${file.fileName}"`,
            );
            break;
          }
          case "txt": {
            text = buffer.toString("utf-8");
            logger.info(
              `Loaded ${text.length} chars from TXT "${file.fileName}"`,
            );
            break;
          }
        }

        if (!text.trim()) {
          logger.warn(`Empty text extracted from "${file.fileName}" — skipping`);
          continue;
        }

        const lang = await detectLang(text);

        documents.push({
          filePath: file.fileName,
          documentId: file.documentId,
          source: file.source,
          text,
          title: extractedTitle,
          sourceType: file.type,
          lang: lang ?? undefined,
        });
      } catch (error) {
        logger.error(
          `Extraction failed for "${file.fileName}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { documents };
  },
});

const indexExtractedDocuments = createStep({
  id: "index-extracted-documents",
  description:
    "Converts extracted documents to RagDocuments and indexes via the shared pipeline",
  inputSchema: extractedDocSchema,
  outputSchema: documentIndexerOutputSchema,
  execute: async ({ inputData, mastra }) => {
    const logger = mastra.getLogger();
    const vectorStore = mastra.getVector("qdrant");
    const embedModel = new ModelRouterEmbeddingModel(env.EMBED_MODEL);
    const translator = mastra.getAgent("translatorAgent");

    const ragDocuments: RagDocument[] = inputData.documents.map((doc) =>
      fileToRagDocument({
        documentId: doc.documentId,
        filePath: doc.filePath,
        source: doc.source,
        text: doc.text,
        title: doc.title,
        sourceType: doc.sourceType,
        lang: doc.lang,
      }),
    );

    const result = await indexDocuments(ragDocuments, {
      vectorStore,
      embedModel,
      translator,
      logger,
    });

    logger.info(
      `Document indexing complete: ${result.indexed} indexed, ${result.skipped} skipped, ${result.errors} errors`,
    );

    return result;
  },
});

const documentIndexerWorkflow = createWorkflow({
  id: "document-indexer",
  inputSchema: documentIndexerInputSchema,
  outputSchema: documentIndexerOutputSchema,
})
  .then(extractText)
  .then(indexExtractedDocuments);

documentIndexerWorkflow.commit();

export { documentIndexerWorkflow };
