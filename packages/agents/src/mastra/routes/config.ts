import { registerApiRoute } from "@mastra/core/server";
import { invalidateConfig, getConfig } from "../lib/config";
import { testChatwootConnection } from "../lib/chatwoot-api";

export const configRoutes = [
  registerApiRoute("/config/invalidate", {
    method: "POST",
    handler: async (c) => {
      await invalidateConfig();
      return c.json({ ok: true });
    },
  }),

  registerApiRoute("/config/test-chatwoot", {
    method: "POST",
    handler: async (c) => {
      const config = await getConfig();
      if (!config.chatwootBaseUrl || !config.chatwootApiToken) {
        return c.json(
          { ok: false, error: "Chatwoot credentials not configured" },
          400,
        );
      }

      const result = await testChatwootConnection({
        baseUrl: config.chatwootBaseUrl,
        apiToken: config.chatwootApiToken,
      });

      return c.json(result, result.ok ? 200 : 502);
    },
  }),
];
