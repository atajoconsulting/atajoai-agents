import type { Mastra } from "@mastra/core/mastra";
import { deleteObjectByKey, getObjectBuffer, prisma } from "@atajoai/db";
import PgBoss from "pg-boss";
import { env } from "../env";
import { contentTypeFromSourceType, type DocumentSourceType, validateDocumentBuffer } from "./document-files";

const INDEX_URL_JOB = "index-web";
const INDEX_FILE_JOB = "index-document";
const DELETE_DOCUMENT_JOB = "delete-document";
const DOCUMENT_TIMEOUT_MS = 5 * 60 * 1000;

type IndexUrlJobPayload = {
  documentId: string;
  url: string;
  title?: string;
};

type IndexFileJobPayload = {
  documentId: string;
  s3Key: string;
  fileName: string;
  sourceType: DocumentSourceType;
  title?: string;
};

type DeleteDocumentJobPayload = {
  documentId: string;
};

const boss = new PgBoss({
  connectionString: env.DATABASE_URL,
  schema: "app",
});

let startupPromise: Promise<void> | null = null;
let handlersRegistered = false;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Document processing timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function getDocument(documentId: string) {
  return prisma.indexedDocument.findUnique({
    where: { id: documentId },
  });
}

async function setDocumentStatus(
  documentId: string,
  data: Parameters<typeof prisma.indexedDocument.update>[0]["data"],
) {
  return prisma.indexedDocument.update({
    where: { id: documentId },
    data,
  });
}

async function runWorkflow<TOutput>(
  mastra: Mastra,
  workflowId: string,
  inputData: unknown,
): Promise<TOutput> {
  const workflow = mastra.getWorkflow(workflowId);
  const run = await workflow.createRun();
  return withTimeout(run.start({ inputData }) as Promise<TOutput>, DOCUMENT_TIMEOUT_MS);
}

async function handleIndexUrlJob(mastra: Mastra, payload: IndexUrlJobPayload) {
  const document = await getDocument(payload.documentId);
  if (!document) {
    return;
  }

  await setDocumentStatus(document.id, {
    status: "indexing",
    errorMessage: null,
  });

  try {
    const result = await runWorkflow<{
      crawledPages: Array<{ contentHash: string; title: string }>;
      chunkCount: number;
    }>(mastra, "webIndexerWorkflow", {
      documentId: document.id,
      title: document.title ?? payload.title,
      source: document.source,
      urls: [payload.url],
    });

    if (result.chunkCount === 0) {
      throw new Error("No se pudo extraer contenido indexable del URL");
    }

    await setDocumentStatus(document.id, {
      status: "indexed",
      chunkCount: result.chunkCount,
      contentHash: result.crawledPages[0]?.contentHash ?? document.contentHash,
      title: result.crawledPages[0]?.title ?? document.title,
      indexedAt: new Date(),
      errorMessage: null,
    });
  } catch (error) {
    await setDocumentStatus(document.id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleIndexFileJob(mastra: Mastra, payload: IndexFileJobPayload) {
  const document = await getDocument(payload.documentId);
  if (!document) {
    return;
  }

  await setDocumentStatus(document.id, {
    status: "indexing",
    errorMessage: null,
  });

  try {
    const buffer = await getObjectBuffer(payload.s3Key);
    const validation = validateDocumentBuffer(buffer, payload.sourceType);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const result = await runWorkflow<{ chunkCount: number }>(
      mastra,
      "documentIndexerWorkflow",
      {
        files: [
          {
            documentId: document.id,
            content: buffer.toString("base64"),
            fileName: payload.fileName,
            source: document.source,
            s3Key: payload.s3Key,
            title: document.title ?? payload.title,
            type: payload.sourceType,
          },
        ],
      },
    );

    if (result.chunkCount === 0) {
      throw new Error("No se pudo extraer contenido indexable del archivo");
    }

    await setDocumentStatus(document.id, {
      status: "indexed",
      chunkCount: result.chunkCount,
      indexedAt: new Date(),
      errorMessage: null,
    });
  } catch (error) {
    await setDocumentStatus(document.id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function handleDeleteDocumentJob(mastra: Mastra, payload: DeleteDocumentJobPayload) {
  const document = await getDocument(payload.documentId);
  if (!document) {
    return;
  }

  try {
    const vectorStore = mastra.getVector("qdrant");
    if (!vectorStore) {
      throw new Error("Qdrant vector store is not available");
    }

    await vectorStore.deleteVectors({
      indexName: env.QDRANT_COLLECTION,
      filter: { documentId: document.id },
    });

    if (document.s3Key) {
      await deleteObjectByKey(document.s3Key);
    }

    await prisma.indexedDocument.delete({
      where: { id: document.id },
    });
  } catch (error) {
    await setDocumentStatus(document.id, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function ensureStarted(mastra?: Mastra): Promise<void> {
  if (!startupPromise) {
    startupPromise = (async () => {
      await boss.start();
    })();
  }

  await startupPromise;

  if (mastra && !handlersRegistered) {
    handlersRegistered = true;
    boss.work(INDEX_URL_JOB, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await handleIndexUrlJob(mastra, job.data as IndexUrlJobPayload);
      }
    });
    boss.work(INDEX_FILE_JOB, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await handleIndexFileJob(mastra, job.data as IndexFileJobPayload);
      }
    });
    boss.work(DELETE_DOCUMENT_JOB, { batchSize: 1 }, async (jobs) => {
      for (const job of jobs) {
        await handleDeleteDocumentJob(mastra, job.data as DeleteDocumentJobPayload);
      }
    });
  }
}

export async function startDocumentJobs(mastra: Mastra): Promise<void> {
  await ensureStarted(mastra);
}

export async function enqueueUrlIndexJob(payload: IndexUrlJobPayload): Promise<void> {
  await ensureStarted();
  await boss.send(INDEX_URL_JOB, payload);
}

export async function enqueueFileIndexJob(payload: IndexFileJobPayload): Promise<void> {
  await ensureStarted();
  await boss.send(INDEX_FILE_JOB, payload);
}

export async function enqueueDeleteDocumentJob(payload: DeleteDocumentJobPayload): Promise<void> {
  await ensureStarted();
  await boss.send(DELETE_DOCUMENT_JOB, payload);
}

export function getDocumentUploadContentType(sourceType: DocumentSourceType): string {
  return contentTypeFromSourceType(sourceType);
}
