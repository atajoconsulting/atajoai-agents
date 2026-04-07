import { createHash } from "node:crypto";
import type { Mastra } from "@mastra/core/mastra";
import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import type { SourceType } from "../../generated/prisma/client";
import { extractDocxText } from "./document-extractor/docx-extractor";
import { extractPdfText } from "./document-extractor/pdf-extractor";
import { getAppConfig } from "./config";
import { env } from "../env";
import { detectLang } from "./language";
import { chunkText } from "./rag/chunker";
import { indexDocuments } from "./rag/indexer";
import { ragDocumentSchema } from "./rag/schemas";
import { prisma } from "./db/prisma";
import { downloadObject, uploadObject, deleteObject } from "./db/s3";
import {
  extractCleanText,
  isErrorPage,
  isSpaPage,
} from "./web-indexer";
import { fetchPage } from "./web-indexer/requester";

type IndexableFileSourceType = Extract<SourceType, "pdf" | "docx" | "txt">;

interface FileIndexJobInput {
  documentId: string;
  fileName: string;
  s3Key: string;
  sourceType: IndexableFileSourceType;
  title?: string | null;
  downloadUrl?: string | null;
}

interface WebDocumentBuildResult {
  title: string;
  contentHash: string;
  chunkCount: number;
  ragDocument: ReturnType<typeof ragDocumentSchema.parse>;
}

function getLogger(mastra: Mastra) {
  return mastra.getLogger();
}

async function getRuntimeIndexerDependencies(mastra: Mastra) {
  const config = await getAppConfig();
  const vectorStore = mastra.getVector("qdrant");
  const translator = mastra.getAgent("translatorAgent");

  if (!vectorStore) {
    throw new Error("Qdrant vector store is not registered");
  }

  if (!translator) {
    throw new Error("Translator agent is not registered");
  }

  return {
    embedModel: new ModelRouterEmbeddingModel(config.embedModel),
    vectorStore,
    translator,
  };
}

async function updateIndexedDocument(
  documentId: string,
  data: Parameters<typeof prisma.indexedDocument.update>[0]["data"],
) {
  await prisma.indexedDocument.update({
    where: { id: documentId },
    data,
  });
}

async function buildWebDocument(
  documentId: string,
  url: string,
  explicitTitle?: string | null,
): Promise<WebDocumentBuildResult> {
  const result = await fetchPage(url);

  if (!result || result.status !== 200) {
    throw new Error(`Failed to fetch ${url}`);
  }

  const parsed = extractCleanText(result.html, url);
  if (isSpaPage(result.html, parsed.text)) {
    throw new Error(`Page ${url} looks like a SPA or has no indexable content`);
  }

  if (isErrorPage(parsed.title, parsed.text)) {
    throw new Error(`Page ${url} looks like an error page`);
  }

  if (!parsed.text.trim()) {
    throw new Error(`Page ${url} returned empty content`);
  }

  const title = explicitTitle?.trim() || parsed.title || url;
  const contentHash = createHash("sha256").update(parsed.text).digest("hex");
  const lang = await detectLang(parsed.text);
  const chunkCount = (
    await chunkText(parsed.text, {
      documentId,
      title,
      source: url,
      sourceType: "web",
    })
  ).length;

  if (chunkCount === 0) {
    throw new Error(`No chunks were produced for ${url}`);
  }

  return {
    title,
    contentHash,
    chunkCount,
    ragDocument: ragDocumentSchema.parse({
      id: documentId,
      title,
      content: parsed.text,
      lang: lang ?? undefined,
      source: url,
      sourceType: "web",
      contentHash,
      metadata: {
        httpStatus: result.status,
        crawledAt: new Date().toISOString(),
      },
      indexedAt: new Date(),
    }),
  };
}

async function resolveFileBuffer(input: FileIndexJobInput): Promise<Buffer> {
  // If a downloadUrl was provided, fetch the file and upload to S3 first
  if (input.downloadUrl?.trim()) {
    const response = await fetch(input.downloadUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download file from ${input.downloadUrl}: HTTP ${response.status}`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await uploadObject(input.s3Key, buffer);
    return buffer;
  }

  // Always read from S3
  return downloadObject(input.s3Key);
}

async function buildFileDocument(
  input: FileIndexJobInput,
): Promise<WebDocumentBuildResult> {
  const buffer = await resolveFileBuffer(input);
  let text = "";
  let extractedTitle = input.title?.trim() || input.fileName.replace(/\.[^.]+$/, "");

  switch (input.sourceType) {
    case "pdf": {
      const result = await extractPdfText(buffer);
      text = result.text;
      if (result.title) {
        extractedTitle = result.title;
      }
      break;
    }
    case "docx": {
      const result = await extractDocxText(buffer);
      text = result.text;
      break;
    }
    case "txt":
      text = buffer.toString("utf-8");
      break;
  }

  if (!text.trim()) {
    throw new Error(`No text could be extracted from ${input.fileName}`);
  }

  const contentHash = createHash("sha256").update(text).digest("hex");
  const lang = await detectLang(text);
  const source = input.s3Key || input.fileName;
  const chunkCount = (
    await chunkText(text, {
      documentId: input.documentId,
      title: extractedTitle,
      source,
      sourceType: input.sourceType,
    })
  ).length;

  if (chunkCount === 0) {
    throw new Error(`No chunks were produced for ${input.fileName}`);
  }

  return {
    title: extractedTitle,
    contentHash,
    chunkCount,
    ragDocument: ragDocumentSchema.parse({
      id: input.documentId,
      title: extractedTitle,
      content: text,
      lang: lang ?? undefined,
      source,
      sourceType: input.sourceType,
      contentHash,
      metadata: {
        fileName: input.fileName,
        s3Key: input.s3Key,
      },
      indexedAt: new Date(),
    }),
  };
}

async function runIndexJob(
  mastra: Mastra,
  documentId: string,
  builder: () => Promise<WebDocumentBuildResult>,
) {
  const logger = getLogger(mastra);

  try {
    await updateIndexedDocument(documentId, {
      status: "indexing",
      errorMessage: null,
      chunkCount: 0,
      indexedAt: null,
    });

    const { vectorStore, embedModel, translator } =
      await getRuntimeIndexerDependencies(mastra);
    const builtDocument = await builder();

    // Vectors use deterministic UUIDv5 IDs (doc.id + chunkIndex), so upsert
    // naturally overwrites existing chunks. We only need to clean up orphan
    // chunks from a previous run that had more chunks than the current one.
    const result = await indexDocuments([builtDocument.ragDocument], {
      vectorStore,
      embedModel,
      translator,
      logger,
    });

    if (result.indexed !== 1 || result.errors > 0) {
      throw new Error(
        `Indexer finished with indexed=${result.indexed}, errors=${result.errors}, skipped=${result.skipped}`,
      );
    }

    // Delete orphan vectors whose contentHash no longer matches (old chunks
    // beyond the new chunk count). Safe: runs only after successful indexing.
    if (builtDocument.contentHash) {
      await vectorStore.deleteVectors({
        indexName: env.QDRANT_COLLECTION,
        filter: {
          documentId,
          contentHash: { $ne: builtDocument.contentHash },
        },
      });
    }

    await updateIndexedDocument(documentId, {
      title: builtDocument.title,
      status: "indexed",
      errorMessage: null,
      chunkCount: builtDocument.chunkCount,
      contentHash: builtDocument.contentHash,
      indexedAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Document indexing failed for ${documentId}: ${message}`);
    await updateIndexedDocument(documentId, {
      status: "error",
      errorMessage: message,
    });
  }
}

export function enqueueWebDocumentIndex(
  mastra: Mastra,
  params: {
    documentId: string;
    url: string;
    title?: string | null;
  },
): void {
  void runIndexJob(mastra, params.documentId, () =>
    buildWebDocument(params.documentId, params.url, params.title),
  );
}

export function enqueueFileDocumentIndex(
  mastra: Mastra,
  input: FileIndexJobInput,
): void {
  void runIndexJob(mastra, input.documentId, () => buildFileDocument(input));
}

export function enqueueDocumentDeletion(
  mastra: Mastra,
  params: { documentId: string },
): void {
  void (async () => {
    const logger = getLogger(mastra);

    try {
      const vectorStore = mastra.getVector("qdrant");
      if (!vectorStore) {
        throw new Error("Qdrant vector store is not registered");
      }

      await vectorStore.deleteVectors({
        indexName: env.QDRANT_COLLECTION,
        filter: { documentId: params.documentId },
      });

      const record = await prisma.indexedDocument.findUnique({
        where: { id: params.documentId },
      });

      if (record?.s3Key) {
        try {
          await deleteObject(record.s3Key);
        } catch (s3Error) {
          logger.warn(
            `Failed to delete S3 object ${record.s3Key} for document ${params.documentId}: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`,
          );
        }
      }

      await prisma.indexedDocument.delete({
        where: { id: params.documentId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Document deletion failed for ${params.documentId}: ${message}`);
      await updateIndexedDocument(params.documentId, {
        status: "error",
        errorMessage: message,
      });
    }
  })();
}
