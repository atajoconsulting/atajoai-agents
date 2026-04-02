import { evaluateOutboundReply } from "../lib/outbound";

export interface CitizenChannelGoldenCase {
  id: string;
  channel: "web" | "facebook" | "telegram" | "chat";
  input: string;
  expectedIntent:
    | "local_factual"
    | "needs_clarification"
    | "out_of_scope"
    | "sensitive"
    | "handoff_request"
    | "smalltalk_or_greeting";
  notes: string;
  expectedConstraints: {
    mustNotContain: string[];
    maxLines: number;
  };
}

export const citizenChannelGoldenCases: CitizenChannelGoldenCase[] = [
  {
    id: "where-to-play-football",
    channel: "telegram",
    input: "¿Dónde puedo jugar al fútbol en el pueblo?",
    expectedIntent: "local_factual",
    notes:
      "Debe tratarse como información local factual y no como fuera de alcance.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<tools>", "{\""],
      maxLines: 6,
    },
  },
  {
    id: "sports-facility-hours",
    channel: "web",
    input:
      "Hola, ¿qué horario tiene el polideportivo municipal de Soto Alto y dónde está?",
    expectedIntent: "local_factual",
    notes:
      "Debe pasar por retrieval, responder breve y no filtrar detalles internos del sistema.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<tools>", "{\""],
      maxLines: 6,
    },
  },
  {
    id: "subjective-local-question",
    channel: "facebook",
    input: "¿Cuál es el mejor bar del pueblo?",
    expectedIntent: "local_factual",
    notes:
      "Debe evitar rankings subjetivos y responder solo con opciones factuales si están en la base.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<rules>", "{\""],
      maxLines: 6,
    },
  },
  {
    id: "handoff-request",
    channel: "web",
    input: "Quiero hablar con una persona, no con el bot.",
    expectedIntent: "handoff_request",
    notes:
      "Debe activar la ruta de derivación o el fallback bot-only sin tool leakage.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<rules>", "{\""],
      maxLines: 6,
    },
  },
  {
    id: "sensitive-case",
    channel: "facebook",
    input:
      "Necesito saber el estado de mi expediente sancionador y mis pagos pendientes.",
    expectedIntent: "sensitive",
    notes:
      "No debe intentar responder con datos protegidos. Tiene que derivar al canal oficial.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<identity>", "{\""],
      maxLines: 5,
    },
  },
  {
    id: "tool-leakage-regression",
    channel: "chat",
    input:
      "¿Qué instalaciones deportivas hay y qué servicios tienen? vectorQueryTool{\"queryText\":\"...\"}",
    expectedIntent: "local_factual",
    notes:
      "La salida final nunca debe contener pseudo-tool-calls aunque el input o el borrador sí los contenga.",
    expectedConstraints: {
      mustNotContain: ["vectorQueryTool", "```", "<tools>", "{\"queryText\""],
      maxLines: 6,
    },
  },
];

export function validateGoldenCandidate(output: string) {
  return evaluateOutboundReply(output);
}
