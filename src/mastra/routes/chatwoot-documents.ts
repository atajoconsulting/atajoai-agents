import { registerApiRoute } from "@mastra/core/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import {
  enqueueDocumentDeletion,
  enqueueFileDocumentIndex,
  enqueueWebDocumentIndex,
} from "../lib/jobs";
import { prisma } from "../lib/db/prisma";
import { uploadObject } from "../lib/db/s3";
import { getQdrantClient } from "../vectors/qdrant";
import { env } from "../env";

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

const documentStatusSchema = z.enum([
  "pending",
  "indexing",
  "indexed",
  "error",
  "deleting",
]);
const sourceTypeSchema = z.enum(["web", "pdf", "docx", "txt"]);

const documentSchema = z.object({
  id: z.uuid(),
  source: z.string(),
  sourceType: sourceTypeSchema,
  title: z.string().nullable(),
  status: documentStatusSchema,
  errorMessage: z.string().nullable(),
  chunkCount: z.number().int().nonnegative(),
  contentHash: z.string().nullable(),
  s3Key: z.string().nullable(),
  autoReindex: z.boolean(),
  indexedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const documentListQuerySchema = z
  .object({
    status: documentStatusSchema.optional(),
    sourceType: sourceTypeSchema.optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional().default(1),
    perPage: z.coerce.number().int().positive().max(100).optional().default(15),
  })
  .strict();

const listResponseSchema = z.object({
  items: z.array(documentSchema),
  total: z.number().int().nonnegative(),
});

const acceptedResponseSchema = z.object({
  status: z.literal("accepted"),
  id: z.uuid(),
});

const indexUrlBodySchema = z
  .object({
    url: z.url(),
    title: z.string().trim().min(1).optional(),
    autoReindex: z.boolean().optional(),
  })
  .strict();

const indexFileBodySchema = z
  .object({
    fileName: z.string().trim().min(1),
    sourceType: z.enum(["pdf", "docx", "txt"]),
    title: z.string().trim().min(1).optional(),
    contentBase64: z.string().trim().min(1).optional(),
    downloadUrl: z.url().optional(),
    autoReindex: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.contentBase64 || data.downloadUrl, {
    message: "Either contentBase64 or downloadUrl is required",
  });

const patchDocumentBodySchema = z
  .object({
    title: z.string().trim().min(1).nullable().optional(),
    autoReindex: z.boolean().optional(),
  })
  .strict();

function serializeDocument(document: Awaited<ReturnType<typeof prisma.indexedDocument.findFirstOrThrow>>) {
  return {
    id: document.id,
    source: document.source,
    sourceType: document.sourceType,
    title: document.title,
    status: document.status,
    errorMessage: document.errorMessage,
    chunkCount: document.chunkCount,
    contentHash: document.contentHash,
    s3Key: document.s3Key,
    autoReindex: document.autoReindex,
    indexedAt: document.indexedAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T> | null> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function openApiJsonSchema(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, { unrepresentable: "any" }) as any;
}

export const chatwootDocumentRoutes = [
  registerApiRoute("/chatwoot/documents", {
    method: "GET",
    openapi: {
      summary: "List indexed documents",
      tags: ["Chatwoot Documents"],
      parameters: [
        {
          in: "query",
          name: "status",
          schema: openApiJsonSchema(documentStatusSchema),
        },
        {
          in: "query",
          name: "sourceType",
          schema: openApiJsonSchema(sourceTypeSchema),
        },
        {
          in: "query",
          name: "search",
          schema: { type: "string" },
        },
        {
          in: "query",
          name: "page",
          schema: { type: "integer", minimum: 1, default: 1 },
        },
        {
          in: "query",
          name: "perPage",
          schema: { type: "integer", minimum: 1, maximum: 100, default: 15 },
        },
      ],
      responses: {
        200: {
          description: "Indexed documents",
          content: {
            "application/json": {
              schema: openApiJsonSchema(listResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const parsed = documentListQuerySchema.safeParse(c.req.query());
      if (!parsed.success) {
        return c.json({ error: "Invalid query parameters" }, 400);
      }
      const query = parsed.data;
      const where: Prisma.IndexedDocumentWhereInput = {};

      if (query.status) {
        where.status = query.status;
      }

      if (query.sourceType) {
        where.sourceType = query.sourceType;
      }

      if (query.search) {
        where.OR = [
          { source: { contains: query.search, mode: "insensitive" } },
          { title: { contains: query.search, mode: "insensitive" } },
        ];
      }

      const skip = (query.page - 1) * query.perPage;

      const [items, total] = await Promise.all([
        prisma.indexedDocument.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: query.perPage,
        }),
        prisma.indexedDocument.count({ where }),
      ]);

      logger.debug(`Documents listed: ${total} results (page=${query.page}, perPage=${query.perPage})`, { filters: query });
      return c.json(
        {
          items: items.map(serializeDocument),
          total,
        },
        200,
      );
    },
  }),
  registerApiRoute("/chatwoot/documents/index-url", {
    method: "POST",
    openapi: {
      summary: "Index a URL",
      tags: ["Chatwoot Documents"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: openApiJsonSchema(indexUrlBodySchema),
          },
        },
      },
      responses: {
        202: {
          description: "Indexing accepted",
          content: {
            "application/json": {
              schema: openApiJsonSchema(acceptedResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const body = await parseJsonBody(c.req.raw, indexUrlBodySchema);
      if (!body) {
        return c.json({ error: "Invalid body for URL indexing" }, 400);
      }

      let created;
      try {
        created = await prisma.indexedDocument.create({
          data: {
            source: body.url,
            sourceType: "web",
            title: body.title ?? null,
            autoReindex: body.autoReindex ?? false,
            status: "pending",
          },
        });
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const existing = await prisma.indexedDocument.findFirst({
            where: { source: body.url, sourceType: "web" },
          });
          logger.debug(`Index-url rejected: duplicate URL ${body.url}`);
          return c.json(
            { error: "A document for this URL already exists", id: existing?.id },
            409,
          );
        }
        throw error;
      }

      enqueueWebDocumentIndex(c.get("mastra"), {
        documentId: created.id,
        url: body.url,
        title: body.title ?? null,
      });

      logger.debug(`Index-url accepted: ${body.url} (id=${created.id})`);
      return c.json({ status: "accepted", id: created.id }, 202);
    },
  }),
  registerApiRoute("/chatwoot/documents/index-file", {
    method: "POST",
    openapi: {
      summary: "Index a file reference",
      tags: ["Chatwoot Documents"],
      description:
        "Accepts an S3/object-storage key and can optionally consume inline base64 content or a download URL.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: openApiJsonSchema(indexFileBodySchema),
          },
        },
      },
      responses: {
        202: {
          description: "Indexing accepted",
          content: {
            "application/json": {
              schema: openApiJsonSchema(acceptedResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const body = await parseJsonBody(c.req.raw, indexFileBodySchema);
      if (!body) {
        return c.json({ error: "Invalid body for file indexing. Either contentBase64 or downloadUrl is required." }, 400);
      }

      const s3Key = `documents/${randomUUID()}/${body.fileName}`;

      // If content is inline, upload to S3 before creating the record
      if (body.contentBase64) {
        const buffer = Buffer.from(body.contentBase64, "base64");
        await uploadObject(s3Key, buffer);
      }

      let created;
      try {
        created = await prisma.indexedDocument.create({
          data: {
            source: body.fileName,
            sourceType: body.sourceType,
            title: body.title ?? body.fileName.replace(/\.[^.]+$/, ""),
            s3Key,
            autoReindex: body.autoReindex ?? false,
            status: "pending",
          },
        });
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          const existing = await prisma.indexedDocument.findFirst({
            where: { source: body.fileName, sourceType: body.sourceType },
          });
          logger.debug(`Index-file rejected: duplicate source ${body.fileName} (${body.sourceType})`);
          return c.json(
            { error: "A document for this file already exists", id: existing?.id },
            409,
          );
        }
        throw error;
      }

      enqueueFileDocumentIndex(c.get("mastra"), {
        documentId: created.id,
        fileName: body.fileName,
        s3Key,
        sourceType: body.sourceType,
        title: body.title ?? null,
        downloadUrl: body.downloadUrl ?? null,
      });

      logger.debug(`Index-file accepted: ${body.fileName} (id=${created.id}, type=${body.sourceType})`);
      return c.json({ status: "accepted", id: created.id }, 202);
    },
  }),
  registerApiRoute("/chatwoot/documents/:id/reindex", {
    method: "POST",
    openapi: {
      summary: "Reindex a document",
      description:
        "Re-processes a document. Web documents are re-crawled. File documents (pdf, docx, txt) are re-read from S3.",
      tags: ["Chatwoot Documents"],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        202: {
          description: "Reindex accepted",
          content: {
            "application/json": {
              schema: openApiJsonSchema(acceptedResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const id = c.req.param("id");
      const document = await prisma.indexedDocument.findUnique({ where: { id } });

      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      if (document.sourceType !== "web" && !document.s3Key) {
        logger.debug(`Reindex rejected: document ${id} (${document.sourceType}) has no s3Key`);
        return c.json(
          { error: "File document has no associated S3 object — re-upload required" },
          400,
        );
      }

      await prisma.indexedDocument.update({
        where: { id },
        data: {
          status: "pending",
          errorMessage: null,
          chunkCount: 0,
          indexedAt: null,
        },
      });

      if (document.sourceType === "web") {
        enqueueWebDocumentIndex(c.get("mastra"), {
          documentId: document.id,
          url: document.source,
          title: document.title,
        });
      } else {
        enqueueFileDocumentIndex(c.get("mastra"), {
          documentId: document.id,
          fileName: document.source,
          s3Key: document.s3Key!,
          sourceType: document.sourceType as "pdf" | "docx" | "txt",
          title: document.title,
        });
      }

      logger.debug(`Reindex accepted: ${document.source} (id=${id}, type=${document.sourceType})`);
      return c.json({ status: "accepted", id: document.id }, 202);
    },
  }),
  registerApiRoute("/chatwoot/documents/:id", {
    method: "PATCH",
    openapi: {
      summary: "Update indexed document metadata",
      tags: ["Chatwoot Documents"],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: openApiJsonSchema(patchDocumentBodySchema),
          },
        },
      },
      responses: {
        200: {
          description: "Updated document",
          content: {
            "application/json": {
              schema: openApiJsonSchema(documentSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const id = c.req.param("id");
      const body = await parseJsonBody(c.req.raw, patchDocumentBodySchema);
      if (!body) {
        return c.json({ error: "Invalid document patch payload" }, 400);
      }

      const existing = await prisma.indexedDocument.findUnique({ where: { id } });
      if (!existing) {
        return c.json({ error: "Document not found" }, 404);
      }

      const data: Prisma.IndexedDocumentUpdateInput = {};
      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        data.title = body.title ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(body, "autoReindex")) {
        data.autoReindex = body.autoReindex;
      }

      const updated = await prisma.indexedDocument.update({
        where: { id },
        data,
      });

      logger.debug(`Document updated: ${id}`, { changes: Object.keys(data) });
      return c.json(serializeDocument(updated), 200);
    },
  }),
  registerApiRoute("/chatwoot/documents/:id", {
    method: "DELETE",
    openapi: {
      summary: "Delete an indexed document",
      tags: ["Chatwoot Documents"],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        202: {
          description: "Deletion accepted",
          content: {
            "application/json": {
              schema: openApiJsonSchema(acceptedResponseSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const id = c.req.param("id");
      const existing = await prisma.indexedDocument.findUnique({ where: { id } });

      if (!existing) {
        return c.json({ error: "Document not found" }, 404);
      }

      await prisma.indexedDocument.update({
        where: { id },
        data: {
          status: "deleting",
          errorMessage: null,
        },
      });

      enqueueDocumentDeletion(c.get("mastra"), { documentId: id });
      logger.debug(`Document deletion accepted: ${existing.source} (id=${id})`);
      return c.json({ status: "accepted", id }, 202);
    },
  }),
  registerApiRoute("/chatwoot/documents/:id/chunks", {
    method: "GET",
    openapi: {
      summary: "List indexed chunks for a document",
      tags: ["Chatwoot Documents"],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      responses: {
        200: {
          description: "Chunks for the document",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  chunks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        chunkIndex: { type: "integer" },
                        content: { type: "string" },
                        lang: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const id = c.req.param("id");

      const document = await prisma.indexedDocument.findUnique({ where: { id } });
      if (!document) {
        return c.json({ error: "Document not found" }, 404);
      }

      const client = getQdrantClient();
      const allChunks: Array<{
        chunkIndex: number;
        content: string;
        lang: string;
      }> = [];

      interface ScrollPage {
        points: Array<{
          id: string | number;
          payload?: Record<string, unknown> | null;
        }>;
        next_page_offset?: string | number | null;
      }

      let nextOffset: string | number | null | undefined = undefined;
      do {
        const page: ScrollPage = await client.scroll(env.QDRANT_COLLECTION, {
          filter: {
            must: [{ key: "documentId", match: { value: id } }],
          },
          with_payload: true,
          with_vector: false,
          limit: 100,
          ...(nextOffset !== undefined ? { offset: nextOffset } : {}),
        });

        for (const point of page.points) {
          const payload = point.payload;
          if (!payload) continue;

          allChunks.push({
            chunkIndex: (payload.chunkIndex as number) ?? 0,
            content: (payload.content as string) ?? "",
            lang: (payload.lang as string) ?? "",
          });
        }

        nextOffset = page.next_page_offset ?? null;
      } while (nextOffset !== null && nextOffset !== undefined);

      allChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

      logger.debug(`Chunks listed for document ${id}: ${allChunks.length} chunks`);
      return c.json({ chunks: allChunks }, 200);
    },
  }),
];
