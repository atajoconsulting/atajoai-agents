import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import {
  DEFAULT_APP_CONFIG_ID,
  getAppConfig,
  getChatwootApiToken,
  invalidateAppConfigCache,
  invalidateChatwootApiTokenCache,
  serializeAppConfig,
} from "../lib/config";
import { encryptToken } from "../lib/crypto";
import { prisma } from "../lib/db/prisma";

const nullableTrimmedString = z.string().trim().min(1).nullable().optional();
const nullablePositiveInt = z
  .union([z.number().int().positive(), z.string().trim().min(1)])
  .transform((value) => String(value))
  .nullable()
  .optional();
const nullablePositiveNumber = z
  .number()
  .int()
  .positive()
  .nullable()
  .optional();

const responseStyleSchema = z
  .enum(["brief_structured", "brief_plain"])
  .nullable()
  .optional();

const configPatchSchema = z
  .object({
    orgName: nullableTrimmedString,
    orgPhone: nullableTrimmedString,
    orgSchedule: nullableTrimmedString,
    orgAddress: nullableTrimmedString,
    orgWebsite: z.url().nullable().optional(),
    orgEOffice: z.url().nullable().optional(),
    preferredLang: nullableTrimmedString,
    responseStyle: responseStyleSchema,
    llmModel: nullableTrimmedString,
    llmModelMedium: nullableTrimmedString,
    llmModelSmall: nullableTrimmedString,
    embedModel: nullableTrimmedString,
    retrievalTopK: nullablePositiveNumber,
    retrievalFinalK: nullablePositiveNumber,
    customInstructions: nullableTrimmedString,
    greetingMessage: nullableTrimmedString,
    outOfScopeMessage: nullableTrimmedString,
    chatwootBaseUrl: z.url().nullable().optional(),
    chatwootApiToken: nullableTrimmedString,
    enableHandoff: z.boolean().optional(),
    handoffTeamId: nullablePositiveInt,
    handoffAssigneeId: nullablePositiveInt,
  })
  .strict();

const serializedConfigSchema = z.object({
  id: z.string(),
  orgName: z.string(),
  orgPhone: z.string(),
  orgSchedule: z.string(),
  orgAddress: z.string(),
  orgWebsite: z.string(),
  orgEOffice: z.string(),
  preferredLang: z.string(),
  responseStyle: z.enum(["brief_structured", "brief_plain"]),
  llmModel: z.string(),
  llmModelMedium: z.string(),
  llmModelSmall: z.string(),
  embedModel: z.string(),
  retrievalTopK: z.number().int().positive(),
  retrievalFinalK: z.number().int().positive(),
  customInstructions: z.string().nullable(),
  greetingMessage: z.string().nullable(),
  outOfScopeMessage: z.string().nullable(),
  chatwootBaseUrl: z.string().nullable(),
  chatwootApiToken: z.string().nullable(),
  enableHandoff: z.boolean(),
  handoffTeamId: z.number().int().positive().nullable(),
  handoffAssigneeId: z.number().int().positive().nullable(),
  updatedAt: z.date(),
});

function badRequest(message: string, issues?: unknown) {
  return {
    error: message,
    ...(issues ? { issues } : {}),
  };
}

function openApiSchema(schema: z.ZodTypeAny) {
  return z.toJSONSchema(schema, { unrepresentable: "any" }) as any;
}

export const chatwootConfigRoutes = [
  registerApiRoute("/chatwoot/config", {
    method: "GET",
    openapi: {
      summary: "Get Chatwoot runtime configuration",
      tags: ["Chatwoot Config"],
      responses: {
        200: {
          description: "Current runtime configuration",
          content: {
            "application/json": {
              schema: openApiSchema(serializedConfigSchema),
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const [config, apiToken] = await Promise.all([getAppConfig(), getChatwootApiToken()]);
      logger.debug("Config fetched");
      return c.json({
        ...serializeAppConfig(config),
        chatwootApiToken: apiToken ? "******" : null,
      }, 200);
    },
  }),
  registerApiRoute("/chatwoot/config", {
    method: "PATCH",
    openapi: {
      summary: "Update Chatwoot runtime configuration",
      tags: ["Chatwoot Config"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: openApiSchema(configPatchSchema),
          },
        },
      },
      responses: {
        200: {
          description: "Updated runtime configuration",
          content: {
            "application/json": {
              schema: openApiSchema(serializedConfigSchema),
            },
          },
        },
        400: {
          description: "Invalid configuration payload",
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const body = await c.req.json().catch(() => null);
      const parsed = configPatchSchema.safeParse(body);

      if (!parsed.success) {
        logger.debug("Config PATCH rejected: invalid payload");
        return c.json(badRequest("Invalid configuration payload", parsed.error.flatten()), 400);
      }

      const current = await getAppConfig();
      const nextTopK = parsed.data.retrievalTopK ?? current.retrievalTopK;
      const nextFinalK = parsed.data.retrievalFinalK ?? current.retrievalFinalK;

      if (nextFinalK > nextTopK) {
        logger.debug("Config PATCH rejected: retrievalFinalK > retrievalTopK");
        return c.json(
          badRequest("retrievalFinalK cannot be greater than retrievalTopK"),
          400,
        );
      }

      const createData: Prisma.AppConfigUncheckedCreateInput = {
        id: DEFAULT_APP_CONFIG_ID,
      };
      const updateData: Prisma.AppConfigUncheckedUpdateInput = {};
      const assign = (
        key: Exclude<keyof Prisma.AppConfigUncheckedCreateInput, "id">,
        value: unknown,
      ) => {
        (createData as Record<string, unknown>)[key] = value;
        (updateData as Record<string, unknown>)[key] = value;
      };

      for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
        const value = parsed.data[key];
        const stored = key === "chatwootApiToken" && typeof value === "string"
          ? encryptToken(value)
          : value;
        assign(key as Exclude<keyof Prisma.AppConfigUncheckedCreateInput, "id">, stored);
      }

      await prisma.appConfig.upsert({
        where: { id: DEFAULT_APP_CONFIG_ID },
        create: createData,
        update: updateData,
      });

      const hasTokenChange = "chatwootApiToken" in parsed.data;
      await Promise.all([
        invalidateAppConfigCache(),
        hasTokenChange ? invalidateChatwootApiTokenCache() : Promise.resolve(),
      ]);
      const [updatedConfig, updatedToken] = await Promise.all([
        getAppConfig({ forceRefresh: true }),
        getChatwootApiToken(),
      ]);
      const changedKeys = Object.keys(parsed.data);
      logger.debug(`Config updated: ${changedKeys.join(", ")}`);
      return c.json({
        ...serializeAppConfig(updatedConfig),
        chatwootApiToken: updatedToken ? "******" : null,
      }, 200);
    },
  }),
];
