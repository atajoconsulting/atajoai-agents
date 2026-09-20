import { env } from "../env";

/**
 * Validates the X-API-Key header on every /chatwoot/* request.
 *
 * In production, MASTRA_API_KEY must be set in the environment. In
 * development/test we warn rather than block (so the OpenAPI explorer
 * keeps working) but a key still has to match if it is configured.
 */
export async function chatwootApiKeyAuth(c: any, next: () => Promise<void>): Promise<any> {
  const configuredKey = env.MASTRA_API_KEY;

  if (!configuredKey) {
    if (env.NODE_ENV === "production") {
      return c.json(
        { error: "Mastra API key not configured" },
        500,
      );
    }
    // dev/test: allow unauthenticated calls so the OpenAPI explorer
    // and integration tests can hit the service without ceremony.
    await next();
    return;
  }

  const provided = c.req.header("x-api-key");
  if (!provided || provided !== configuredKey) {
    return c.json({ error: "Invalid or missing X-API-Key" }, 401);
  }

  await next();
}
