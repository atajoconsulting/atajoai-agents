import { registerApiRoute } from "@mastra/core/server";
import { prisma } from "../lib/db/prisma";
import {
  invalidateAppConfigCache,
  invalidateChatwootApiTokenCache,
} from "../lib/config";
import { getQdrantClient } from "../vectors/qdrant";
import { env } from "../env";

/**
 * DELETE /chatwoot/:tenantId
 *
 * Deprovisions a tenant: deletes AppConfig, all IndexedDocuments, all
 * Qdrant vectors tagged with this tenant, and invalidates caches.
 * Called by Chatwoot when an AgentBot is deleted.
 */
export const chatwootTenantRoutes = [
  registerApiRoute("/chatwoot/:tenantId", {
    method: "DELETE",
    openapi: {
      summary: "Deprovision a Mastra tenant",
      description:
        "Removes the tenant's configuration, indexed documents, and vector embeddings.",
      tags: ["Chatwoot Tenant"],
      parameters: [
        {
          in: "path",
          name: "tenantId",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        202: { description: "Deprovision accepted" },
      },
    },
    handler: async (c) => {
      const tenantId = c.req.param("tenantId");
      const logger = c.get("mastra").getLogger();

      // 1. Delete all Qdrant vectors for this tenant
      try {
        const client = getQdrantClient();
        await client.delete(env.QDRANT_COLLECTION, {
          filter: {
            must: [{ key: "tenantId", match: { value: tenantId } }],
          },
        });
        logger.debug(`Qdrant vectors deleted for tenant=${tenantId}`);
      } catch (error) {
        // Qdrant may be down — log and continue (Prisma cleanup is more critical)
        logger.warn(
          `Qdrant deletion failed for tenant=${tenantId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // 2. Delete all IndexedDocuments for this tenant
      const deletedDocs = await prisma.indexedDocument.deleteMany({
        where: { tenantId },
      });

      // 3. Delete the AppConfig for this tenant
      const deletedConfig = await prisma.appConfig.deleteMany({
        where: { id: tenantId },
      });

      // 4. Invalidate caches
      await Promise.all([
        invalidateAppConfigCache(tenantId),
        invalidateChatwootApiTokenCache(tenantId),
      ]);

      logger.info(
        `Tenant deprovisioned: tenant=${tenantId}, docs=${deletedDocs.count}, config=${deletedConfig.count}`,
      );
      return c.json({ status: "accepted", tenantId }, 202);
    },
  }),
];
