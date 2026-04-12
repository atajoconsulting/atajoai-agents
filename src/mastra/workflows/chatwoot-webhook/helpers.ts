import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { z } from "zod";
import { localEvidenceSchema, type RouteMessageResult } from "../../lib/outbound";
import { type ResolvedAppConfig } from "../../lib/config";
import { buildEvidenceQuery } from "../../lib/rag/retrieval";
import { CHUNK_CONFIG } from "../../lib/rag/chunker";
import { env } from "../../env";

export const MAX_EVIDENCE_CHARS = CHUNK_CONFIG.maxSize;
export const MAX_INPUT_LENGTH = 2000;
export const LLM_TIMEOUT_MS = 30_000;

const CHATWOOT_CHANNEL_MAP: Record<string, string> = {
  "Channel::WebWidget": "web",
  "Channel::FacebookPage": "facebook",
  "Channel::TwitterProfile": "twitter",
  "Channel::Whatsapp": "whatsapp",
  "Channel::Api": "api",
  "Channel::Email": "email",
  "Channel::Sms": "sms",
  "Channel::TwilioSms": "sms",
  "Channel::Telegram": "telegram",
  "Channel::Line": "line",
  "Channel::Instagram": "instagram",
  "Channel::Tiktok": "tiktok",
};

export function normalizeChannel(raw?: string | null): string {
  if (!raw) return "web";
  return CHATWOOT_CHANNEL_MAP[raw] ?? "web";
}

export function getDefaultRoute() {
  return {
    intent: "needs_clarification" as const,
    requiresRetrieval: false,
    requiresClarification: false,
    requestedHandoff: false,
    sensitivity: "normal" as const,
  };
}

export function getDefaultJudgement() {
  return {
    answerable: false,
    confidence: "low" as const,
    missingInfo: [] as string[],
    fallbackMode: "contact_phone" as const,
  };
}

export function getJudgementForNonFactualRoute(route: RouteMessageResult) {
  if (route.intent === "handoff_request") {
    return {
      answerable: false,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "handoff" as const,
    };
  }

  if (route.intent === "smalltalk_or_greeting") {
    return {
      answerable: true,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "none" as const,
    };
  }

  if (route.intent === "needs_clarification" || route.requiresClarification) {
    return {
      answerable: false,
      confidence: "medium" as const,
      missingInfo: [],
      fallbackMode: "clarify" as const,
    };
  }

  if (route.intent === "sensitive" || route.sensitivity === "sensitive") {
    return {
      answerable: false,
      confidence: "high" as const,
      missingInfo: [],
      fallbackMode: "safe_refusal" as const,
    };
  }

  return {
    answerable: false,
    confidence: "high" as const,
    missingInfo: [],
    fallbackMode: "contact_phone" as const,
  };
}

export function formatEvidenceForPrompt(
  evidence: z.infer<typeof localEvidenceSchema>[],
): string {
  if (evidence.length === 0) {
    return "No se recupero evidencia.";
  }

  return evidence
    .map((chunk, index) => {
      const excerpt =
        chunk.content.length > MAX_EVIDENCE_CHARS
          ? `${chunk.content.slice(0, MAX_EVIDENCE_CHARS)}...`
          : chunk.content;

      return [
        `Fuente ${index + 1}`,
        `- Titulo: ${chunk.title}`,
        `- Origen: ${chunk.source}`,
        `- Score: ${chunk.score.toFixed(3)}`,
        `- Fragmento: ${excerpt}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function retrieveLocalEvidence({
  mastra,
  queryText,
  config,
}: {
  mastra: any;
  queryText: string;
  config: ResolvedAppConfig;
}): Promise<z.infer<typeof localEvidenceSchema>[]> {
  const vectorStore = mastra.getVector("qdrant");
  if (!vectorStore) {
    const logger = mastra.getLogger();
    logger.warn("[chatwoot-webhook] Qdrant vector store not registered — returning empty evidence");
    return [];
  }

  const embedModel = new ModelRouterEmbeddingModel(config.embedModel);
  const { embeddings } = await embedModel.doEmbed({ values: [queryText] });
  const [queryVector] = embeddings;
  const results = await vectorStore.query(
    buildEvidenceQuery(env.QDRANT_COLLECTION, queryVector, config),
  );

  const deduped = new Map<string, z.infer<typeof localEvidenceSchema>>();

  for (const result of results) {
    const metadata = result.metadata ?? {};
    const parsed = localEvidenceSchema.safeParse({
      documentId: String(metadata.documentId ?? result.id),
      title: String(metadata.title ?? "Informacion local"),
      source: String(metadata.source ?? "desconocido"),
      content: String(metadata.content ?? result.document ?? ""),
      chunkIndex: Number(metadata.chunkIndex ?? 0),
      score: Number(result.score ?? 0),
      lang:
        typeof metadata.lang === "string" ? metadata.lang : undefined,
    });

    if (!parsed.success || !parsed.data.content.trim()) {
      continue;
    }

    if (parsed.data.score < config.retrievalMinScore) {
      continue;
    }

    const key = `${parsed.data.documentId}:${parsed.data.chunkIndex}`;
    if (deduped.has(key)) {
      continue;
    }

    let isOverlapping = false;
    for (const existing of deduped.values()) {
      if (
        existing.documentId === parsed.data.documentId &&
        Math.abs(existing.chunkIndex - parsed.data.chunkIndex) <= 1
      ) {
        isOverlapping = true;
        break;
      }
    }

    if (!isOverlapping) {
      deduped.set(key, parsed.data);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, config.retrievalFinalK);
}
