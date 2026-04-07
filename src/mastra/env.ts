import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalPositiveInt = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return value;
  },
  z.coerce.number().int().positive().optional(),
);

export const env = createEnv({
  server: {
    CHATWOOT_BASE_URL: z.url().optional(),
    CHATWOOT_API_TOKEN: z.string().min(1).optional(),
    CHATWOOT_PANEL_API_KEY: z.string().min(1).default("changeme"),
    REDIS_URL: z.string().min(1),
    ENABLE_STARTUP_CHECKS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CHATWOOT_ENABLE_HUMAN_HANDOFF: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CHATWOOT_HANDOFF_TEAM_ID: optionalPositiveInt,
    CHATWOOT_HANDOFF_ASSIGNEE_ID: optionalPositiveInt,
    EMBED_MODEL: z.string(),
    LLM_MODEL: z.string().min(1),
    LLM_MODEL_MEDIUM: z.string().min(1),
    LLM_MODEL_SMALL: z.string().min(1),
    DATABASE_URL: z.string(),
    MISTRAL_API_KEY: z.string().optional(),
    QDRANT_URL: z.string().default("http://localhost:6333"),
    QDRANT_API_KEY: z.string().optional(),
    QDRANT_COLLECTION: z.string().default("default"),
    QDRANT_VECTOR_SIZE: z.coerce.number().int().positive().default(1024),
    AWS_REGION: z.string().default("eu-west-1"),
    AWS_ENDPOINT_URL_S3: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET: z.string().default("atajoai"),
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
    MUNICIPALITY_PREFERRED_LANGUAGE: z.string().default("Español"),
    OUTBOUND_RESPONSE_STYLE: z
      .enum(["brief_structured", "brief_plain"])
      .default("brief_structured"),
  },
  runtimeEnv: {
    ...process.env,
    OUTBOUND_RESPONSE_STYLE:
      process.env.OUTBOUND_RESPONSE_STYLE ??
      process.env.WHATSAPP_RESPONSE_STYLE,
  },
});
