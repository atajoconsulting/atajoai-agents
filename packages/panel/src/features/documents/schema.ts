import { z } from "zod";

export const documentUrlSchema = z.object({
  title: z.string().trim().optional(),
  url: z.string().url(),
});

export const documentStatusValues = [
  "pending",
  "indexing",
  "indexed",
  "deleting",
  "error",
] as const;

export type DocumentStatus = (typeof documentStatusValues)[number];
