// Tenants are created on demand by PATCH /chatwoot/:tenantId/config.
// This file is kept as a no-op so that downstream imports keep working
// (the index.ts entrypoint still calls a seed function for clarity).
export async function seedDefaultConfig(): Promise<void> {
  // Intentionally empty. The legacy "default" singleton is gone — each
  // tenant gets its own AppConfig row provisioned via the API.
}
