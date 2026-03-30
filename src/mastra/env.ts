import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CHATWOOT_BASE_URL: z.url(),
    CHATWOOT_API_TOKEN: z.string().min(1),
    EMBED_MODEL: z.string(),
    LLM_MODEL: z.string().min(1),
    LLM_MODEL_MEDIUM: z.string().min(1),
    LLM_MODEL_SMALL: z.string().min(1),
    DATABASE_URL: z.string(),
    QDRANT_URL: z.string().default("http://localhost:6333"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    MUNICIPALITY_NAME: z.string().default("Ayuntamiento"),
    MUNICIPALITY_PHONE: z.string().default("010"),
    MUNICIPALITY_SCHEDULE: z
      .string()
      .default("lunes a viernes de 9:00 a 14:00"),
    MUNICIPALITY_ADDRESS: z.string().default("Plaza Mayor, 1"),
    MUNICIPALITY_WEBSITE: z.string().default("https://www.ayuntamiento.es"),
    MUNICIPALITY_ELECTRONIC_OFFICE_URL: z
      .string()
      .default("https://sede.ayuntamiento.es"),
    MUNICIPALITY_CHANNEL: z.string().default("chat"),
    MUNICIPALITY_PREFERRED_LANGUAGE: z.string().default("Español"),
  },
  runtimeEnv: process.env,
});
