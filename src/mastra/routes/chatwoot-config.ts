import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import {
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
    customInstructions: nullableTrimmedString,
    greetingMessage: nullableTrimmedString,
    outOfScopeMessage: nullableTrimmedString,
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
  customInstructions: z.string().nullable(),
  greetingMessage: z.string().nullable(),
  outOfScopeMessage: z.string().nullable(),
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
  registerApiRoute("/chatwoot/:tenantId/config", {
    method: "GET",
    openapi: {
      summary: "Get Chatwoot runtime configuration for a tenant",
      tags: ["Chatwoot Config"],
      parameters: [
        {
          in: "path",
          name: "tenantId",
          required: true,
          schema: { type: "string" },
        },
      ],
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
      const tenantId = c.req.param("tenantId");
      const logger = c.get("mastra").getLogger();
      const [config, apiToken] = await Promise.all([
        getAppConfig(tenantId),
        getChatwootApiToken(tenantId),
      ]);
      logger.debug("Config fetched", { tenantId });
      return c.json({
        ...serializeAppConfig(config),
        chatwootApiToken: apiToken ?? null,
      }, 200);
    },
  }),
  registerApiRoute("/chatwoot/:tenantId/config", {
    method: "PATCH",
    openapi: {
      summary: "Create or update Chatwoot runtime configuration for a tenant",
      tags: ["Chatwoot Config"],
      parameters: [
        {
          in: "path",
          name: "tenantId",
          required: true,
          schema: { type: "string" },
        },
      ],
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
      const tenantId = c.req.param("tenantId");
      const logger = c.get("mastra").getLogger();
      const body = await c.req.json().catch(() => null);
      const parsed = configPatchSchema.safeParse(body);

      if (!parsed.success) {
        logger.debug("Config PATCH rejected: invalid payload", { tenantId });
        return c.json(badRequest("Invalid configuration payload", parsed.error.flatten()), 400);
      }

      const createData: Prisma.AppConfigUncheckedCreateInput = {
        id: tenantId,
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

      // Idempotent: creates the tenant row on first call, updates on subsequent.
      await prisma.appConfig.upsert({
        where: { id: tenantId },
        create: createData,
        update: updateData,
      });

      const hasTokenChange = "chatwootApiToken" in parsed.data;
      await Promise.all([
        invalidateAppConfigCache(tenantId),
        hasTokenChange ? invalidateChatwootApiTokenCache(tenantId) : Promise.resolve(),
      ]);
      const [updatedConfig, updatedToken] = await Promise.all([
        getAppConfig(tenantId, { forceRefresh: true }),
        getChatwootApiToken(tenantId),
      ]);
      const changedKeys = Object.keys(parsed.data);
      logger.debug(`Config updated: ${changedKeys.join(", ")}`, { tenantId });
      return c.json({
        ...serializeAppConfig(updatedConfig),
        chatwootApiToken: updatedToken ?? null,
      }, 200);
    },
  }),
];
