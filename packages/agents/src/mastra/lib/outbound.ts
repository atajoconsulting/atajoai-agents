import { z } from "zod";
import type { AppConfig } from "@atajoai/db";

export const localIntentSchema = z.enum([
  "local_factual",
  "needs_clarification",
  "out_of_scope",
  "sensitive",
  "handoff_request",
  "smalltalk_or_greeting",
]);

export const messageSensitivitySchema = z.enum([
  "normal",
  "sensitive",
  "hostile",
]);

export const routeMessageResultSchema = z.object({
  intent: localIntentSchema,
  requiresRetrieval: z.boolean(),
  requiresClarification: z.boolean(),
  requestedHandoff: z.boolean(),
  sensitivity: messageSensitivitySchema,
});

export const localEvidenceSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  source: z.string(),
  content: z.string(),
  chunkIndex: z.number().int().nonnegative(),
  score: z.number(),
  lang: z.string().optional(),
});

export const answerabilityFallbackSchema = z.enum([
  "none",
  "clarify",
  "contact_phone",
  "contact_web",
  "contact_office",
  "safe_refusal",
  "handoff",
]);

export const judgeAnswerabilityResultSchema = z.object({
  answerable: z.boolean(),
  confidence: z.enum(["low", "medium", "high"]),
  missingInfo: z.array(z.string()),
  fallbackMode: answerabilityFallbackSchema,
});

export const sanitizeReplyResultSchema = z.object({
  isSafeForOutbound: z.boolean(),
  reason: z.string(),
  repairedText: z.string(),
});

export type LocalIntent = z.infer<typeof localIntentSchema>;
export type MessageSensitivity = z.infer<typeof messageSensitivitySchema>;
export type RouteMessageResult = z.infer<typeof routeMessageResultSchema>;
export type LocalEvidence = z.infer<typeof localEvidenceSchema>;
export type AnswerabilityFallback = z.infer<
  typeof answerabilityFallbackSchema
>;
export type JudgeAnswerabilityResult = z.infer<
  typeof judgeAnswerabilityResultSchema
>;
export type SanitizeReplyResult = z.infer<typeof sanitizeReplyResultSchema>;

const TOOL_CALL_PATTERN = /^\s*[\p{L}_][\p{L}\p{N}_-]{2,}\s*[{(]/u;
const JSON_LIKE_PATTERN = /^\s*[\[{]/;
const INTERNAL_TAG_PATTERN =
  /<\/?(tools|rules|identity|security|dynamic_context|critical_reminder|system|assistant|developer)>/i;
const ROLE_PREFIX_PATTERN = /^\s*(system|assistant|developer|tool)\s*:/im;
const CODE_FENCE_PATTERN = /```/;
const TABLE_PATTERN = /^\s*\|.+\|\s*$/m;
const LOCAL_INFO_PATTERN =
  /\b(f[uú]tbol|polideportivo|pista|campo|pabell[oó]n|deporte|deportivo|piscina|biblioteca|centro c[ií]vico|evento|agenda|fiesta|mercado|turismo|monumento|parque|ruta|aparcamiento|parking|bus|autob[uú]s|transporte|museo|hotel|hostal|bar|restaurante|cafeter[ií]a|comercio|tienda|farmacia|colegio|instituto|guarder[ií]a|ocio|instalaci[oó]n|d[oó]nde puedo|d[oó]nde hay|qu[eé] puedo hacer|qu[eé] hay en|horario de|direcci[oó]n de)\b/i;
const SUBJECTIVE_QUERY_PATTERN =
  /\b(mejor|recomienda|recomiendas|recomendaci[oó]n|favorito|top|m[aá]s bonito|m[aá]s recomendable)\b/i;

export function getOutboundStyleInstructions(style: string): string {
  if (style === "brief_plain") {
    return [
      "Use un tono breve y natural para canales de atención ciudadana.",
      "Evite markdown complejo, tablas, JSON y bloques de código.",
      "Mantenga la respuesta en 4-6 líneas salvo que el caso requiera más detalle.",
      "Si la consulta pide una valoración subjetiva, limite la respuesta a opciones factuales disponibles en la base.",
    ].join(" ");
  }

  return [
    "Use un formato breve y estructurado para canales de atención ciudadana.",
    "Como norma general, limite la respuesta a 4-6 líneas.",
    "Si necesita enumerar pasos, lugares o documentos, use como máximo 5 viñetas con '- '.",
    "Nunca use tablas, JSON, nombres de tools ni markdown complejo.",
    "Si la consulta pide una valoración subjetiva, no haga rankings personales; ofrezca solo opciones factuales presentes en la base.",
  ].join(" ");
}

export function looksLikeLocalInfoQuery(text: string): boolean {
  return LOCAL_INFO_PATTERN.test(text);
}

export function isSubjectiveLocalQuery(text: string): boolean {
  return SUBJECTIVE_QUERY_PATTERN.test(text);
}

export function normalizeOutboundReply(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#+\s+/gm, "")
    .replace(/^\*\s+/gm, "- ")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function evaluateOutboundReply(text: string): SanitizeReplyResult {
  const repairedText = normalizeOutboundReply(text);
  const lines = repairedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletCount = lines.filter((line) => line.startsWith("- ")).length;

  if (!repairedText) {
    return {
      isSafeForOutbound: false,
      reason: "empty_reply",
      repairedText,
    };
  }

  if (TOOL_CALL_PATTERN.test(repairedText)) {
    return {
      isSafeForOutbound: false,
      reason: "tool_call_leakage",
      repairedText,
    };
  }

  if (JSON_LIKE_PATTERN.test(repairedText)) {
    return {
      isSafeForOutbound: false,
      reason: "json_like_reply",
      repairedText,
    };
  }

  if (INTERNAL_TAG_PATTERN.test(repairedText)) {
    return {
      isSafeForOutbound: false,
      reason: "internal_tags",
      repairedText,
    };
  }

  if (ROLE_PREFIX_PATTERN.test(repairedText)) {
    return {
      isSafeForOutbound: false,
      reason: "role_prefix",
      repairedText,
    };
  }

  if (CODE_FENCE_PATTERN.test(repairedText) || TABLE_PATTERN.test(repairedText)) {
    return {
      isSafeForOutbound: false,
      reason: "markdown_complex",
      repairedText,
    };
  }

  if (bulletCount > 5) {
    return {
      isSafeForOutbound: false,
      reason: "too_many_bullets",
      repairedText,
    };
  }

  if (lines.length > 8 || repairedText.length > 900) {
    return {
      isSafeForOutbound: false,
      reason: "too_long",
      repairedText,
    };
  }

  return {
    isSafeForOutbound: true,
    reason: "ok",
    repairedText,
  };
}

export function buildOutOfScopeReply(config: AppConfig): string {
  return `Disculpe, solo puedo ayudarle con información factual del ${config.orgName} y de la vida local del municipio. Si lo desea, puedo orientarle sobre servicios, instalaciones, eventos o recursos locales.`;
}

export function buildSensitiveReply(config: AppConfig): string {
  return `Para este asunto, debe contactar directamente con el ${config.orgName} en el ${config.orgPhone ?? "teléfono municipal"} (${config.orgSchedule ?? "horario de oficina"}).`;
}

export function buildClarificationReply(missingInfo: string[]): string {
  const hints = missingInfo.slice(0, 2);
  const detail =
    hints.length > 0
      ? ` Para orientarle bien, indíqueme ${hints.join(" y ")}.`
      : " Para orientarle bien, necesito un poco más de detalle sobre el lugar, servicio, actividad o trámite que desea consultar.";

  return `Necesito un poco más de información para ayudarle.${detail}`;
}

export function buildKnowledgeFallback(
  config: AppConfig,
  mode: AnswerabilityFallback,
  originalQuestion: string,
): string {
  switch (mode) {
    case "clarify":
      return buildClarificationReply([]);
    case "contact_web":
      return `No he podido confirmarlo con suficiente fiabilidad. Puede consultar la web municipal ${config.orgWebsite ?? ""} o la sede electrónica ${config.orgEOffice ?? ""}.`;
    case "contact_office":
      return `No he podido confirmarlo con suficiente fiabilidad. Le recomiendo acudir al ${config.orgName} en ${config.orgAddress ?? "la oficina municipal"} o llamar al ${config.orgPhone ?? "teléfono municipal"}.`;
    case "safe_refusal":
      return buildSensitiveReply(config);
    case "handoff":
      return buildUnavailableHandoffReply(config, originalQuestion);
    case "contact_phone":
    case "none":
    default:
      return `Lo siento, no dispongo de información suficientemente fiable para responder a esa consulta. Le recomiendo contactar con el ${config.orgName} en el ${config.orgPhone ?? "teléfono municipal"} (${config.orgSchedule ?? "horario de oficina"}) o consultar ${config.orgWebsite ?? "la web municipal"}.`;
  }
}

export function buildUnavailableHandoffReply(config: AppConfig, originalQuestion: string): string {
  const suffix = originalQuestion.trim()
    ? "Si lo desea, también puede escribir aquí su consulta concreta e intentaré orientarle con la información local disponible."
    : "Puede escribir aquí su consulta y trataré de orientarle con la información local disponible.";

  return [
    "Ahora mismo este canal no permite derivarle directamente a una persona.",
    `Puede contactar con el ${config.orgName} en el ${config.orgPhone ?? "teléfono municipal"} (${config.orgSchedule ?? "horario de oficina"}) o consultar ${config.orgWebsite ?? "la web municipal"}.`,
    suffix,
  ].join(" ");
}

export function buildHandoffConfirmationReply(): string {
  return "He trasladado su conversación al equipo de atención municipal. En cuanto sea posible, una persona continuará la atención por este mismo canal.";
}

export function buildGreetingReply(config: AppConfig): string {
  if (config.greetingMessage) {
    return config.greetingMessage;
  }

  return [
    `Hola, soy el asistente virtual de información local del ${config.orgName}.`,
    "Puedo ayudarle con trámites, servicios, instalaciones, eventos y recursos del municipio.",
    "La información proporcionada está sujeta a posibles cambios o incidencias de última hora.",
    "¿En qué puedo ayudarle?",
  ].join(" ");
}

export function buildOutOfScopeMessage(config: AppConfig): string {
  if (config.outOfScopeMessage) {
    return config.outOfScopeMessage;
  }
  return buildOutOfScopeReply(config);
}

export function buildHandoffPrivateNote(
  senderName: string,
  messageContent: string,
): string {
  return [
    "[handoff solicitado por bot]",
    `Remitente: ${senderName || "Ciudadano"}`,
    `Motivo: ${messageContent}`,
  ].join("\n");
}
