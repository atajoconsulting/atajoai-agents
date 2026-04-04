import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import { enqueueDeleteDocumentJob, enqueueFileIndexJob, enqueueUrlIndexJob } from "../lib/jobs";
import { documentSourceTypeSchema } from "../lib/document-files";

const indexUrlSchema = z.object({
  documentId: z.string().uuid(),
  title: z.string().optional(),
  url: z.string().url(),
});

const indexFileSchema = z.object({
  documentId: z.string().uuid(),
  fileName: z.string().min(1),
  s3Key: z.string().min(1),
  sourceType: documentSourceTypeSchema,
  title: z.string().optional(),
});

export const documentsRoutes = [
  registerApiRoute("/documents/index-url", {
    method: "POST",
    handler: async (c) => {
      const payload = indexUrlSchema.parse(await c.req.json());
      await enqueueUrlIndexJob(payload);
      return c.json({ ok: true, status: "accepted" }, 202);
    },
  }),

  registerApiRoute("/documents/index-file", {
    method: "POST",
    handler: async (c) => {
      const payload = indexFileSchema.parse(await c.req.json());
      await enqueueFileIndexJob(payload);
      return c.json({ ok: true, status: "accepted" }, 202);
    },
  }),

  registerApiRoute("/documents/:id", {
    method: "DELETE",
    handler: async (c) => {
      const payload = z.object({ id: z.string().uuid() }).parse(c.req.param());
      await enqueueDeleteDocumentJob({ documentId: payload.id });
      return c.json({ ok: true, status: "accepted" }, 202);
    },
  }),
];
