import { registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import { getSystemHealth } from "../lib/health";
import { prisma } from "../lib/db/prisma";

const serviceHealthSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "error", "skipped"]),
  latencyMs: z.number().nullable(),
  message: z.string().optional(),
});

const healthResponseSchema = z.object({
  services: z.array(serviceHealthSchema),
  documentsByStatus: z.record(z.string(), z.number().int().nonnegative()),
});

export const chatwootHealthRoutes = [
  registerApiRoute("/chatwoot/health", {
    method: "GET",
    openapi: {
      summary: "Get Chatwoot system health",
      tags: ["Chatwoot Health"],
      responses: {
        200: {
          description: "System health and indexed document counters",
          content: {
            "application/json": {
              schema: z.toJSONSchema(healthResponseSchema, {
                unrepresentable: "any",
              }) as any,
            },
          },
        },
      },
    },
    handler: async (c) => {
      const logger = c.get("mastra").getLogger();
      const services = await getSystemHealth(logger);
      const grouped = await prisma.indexedDocument.groupBy({
        by: ["status"],
        _count: {
          _all: true,
        },
      });

      const documentsByStatus = grouped.reduce<Record<string, number>>(
        (acc, row) => {
          acc[row.status] = row._count._all;
          return acc;
        },
        {},
      );

      const failed = services.filter((s) => s.status === "error");
      if (failed.length > 0) {
        logger.error(`Health check: ${failed.map((s) => s.name).join(", ")} unhealthy`);
      } else {
        logger.debug("Health check: all services OK");
      }

      return c.json(
        {
          services,
          documentsByStatus,
        },
        200,
      );
    },
  }),
];
