import { z } from "zod";
import {
  DOCUMENT_SOURCE_TYPES,
  contentTypeFromSourceType,
  validateDocumentBuffer,
} from "@atajoai/shared";
import type { DocumentSourceType } from "@atajoai/shared";

export const documentSourceTypeSchema = z.enum(
  DOCUMENT_SOURCE_TYPES as unknown as [string, ...string[]],
);

export { contentTypeFromSourceType, validateDocumentBuffer };
export type { DocumentSourceType };
