import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import {
  getGlobalConfig,
  updateGlobalConfig,
  serializeGlobalConfig,
} from "../lib/global-config";

const globalConfigPatchSchema = z
  .object({
    llmModel: z.string().trim().min(1).nullable().optional(),
    llmModelSmall: z.string().trim().min(1).nullable().optional(),
    embedModel: z.string().trim().min(1).nullable().optional(),
    retrievalTopK: z.number().int().positive().nullable().optional(),
    retrievalFinalK: z.number().int().positive().nullable().optional(),
  })
  .strict();

function openApiSchema(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, { unrepresentable: "any" }) as any;
}

export const chatwootGlobalRoutes = [
  registerApiRoute("/chatwoot/global/config", {
    method: "GET",
    openapi: {
      summary: "Get global Mastra configuration (models, retrieval)",
      tags: ["Chatwoot Global"],
      responses: {
        200: {
          description: "Global configuration",
          content: {
            "application/json": {
              schema: openApiSchema(
                z.object({
                  llmModel: z.string().nullable(),
                  llmModelSmall: z.string().nullable(),
                  embedModel: z.string().nullable(),
                  retrievalTopK: z.number().int().positive(),
                  retrievalFinalK: z.number().int().positive(),
                  updatedAt: z.date(),
                }),
              ),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const config = await getGlobalConfig();
      return c.json(serializeGlobalConfig(config), 200);
    },
  }),
  registerApiRoute("/chatwoot/global/config", {
    method: "PATCH",
    openapi: {
      summary: "Update global Mastra configuration (models, retrieval)",
      tags: ["Chatwoot Global"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: openApiSchema(globalConfigPatchSchema),
          },
        },
      },
      responses: {
        200: {
          description: "Updated global configuration",
          content: {
            "application/json": {
              schema: openApiSchema(
                z.object({
                  llmModel: z.string().nullable(),
                  llmModelSmall: z.string().nullable(),
                  embedModel: z.string().nullable(),
                  retrievalTopK: z.number().int().positive(),
                  retrievalFinalK: z.number().int().positive(),
                  updatedAt: z.date(),
                }),
              ),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const body = await c.req.json().catch(() => null);
      const parsed = globalConfigPatchSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
      }

      const nextTopK = parsed.data.retrievalTopK ?? (await getGlobalConfig()).retrievalTopK;
      const nextFinalK = parsed.data.retrievalFinalK ?? (await getGlobalConfig()).retrievalFinalK;

      if (nextFinalK > nextTopK) {
        return c.json({ error: "retrievalFinalK cannot be greater than retrievalTopK" }, 400);
      }

      // Strip nulls — only update fields that were explicitly provided with a value
      const payload: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined && value !== null) {
          payload[key] = value;
        }
      }
      const updated = await updateGlobalConfig(payload as any);
      logger.debug("Global config updated", { keys: Object.keys(parsed.data) });
      return c.json(serializeGlobalConfig(updated), 200);
    },
  }),
];
