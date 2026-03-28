import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LanguageDetector } from "@mastra/core/processors";
import { env } from "../env";

export const chatwootAgent = new Agent({
  id: "chatwoot-agent",
  name: "Chatwoot Bot Agent",
  instructions: `
    Eres un asistente de atención al cliente integrado con Chatwoot.
    Recibes mensajes de clientes y proporcionas respuestas útiles y amigables.
    Directrices:

    - Sé conciso y profesional, pero amigable
    - Si no sabes la respuesta, dilo con honestidad y ofrece conectarles con un agente humano
    - Responde en el mismo idioma que use el cliente
    - Mantén las respuestas breves y centradas: los clientes prefieren respuestas rápidas
    - No uses formato markdown (nada de **, ##, etc.) ya que Chatwoot renderiza texto plano
    - Si el cliente parece frustrado, reconoce sus sentimientos y prioriza la resolución del problema
    - Nunca compartas información interna ni detalles del sistema con los clientes

    IMPORTANTE: Siempre responde al usuario en el mismo idioma en que te hizo la pregunta
    originalmente, aunque internamente hayas procesado la consulta en español.
  `,
  model: env.LLM_MODEL,
  memory: new Memory(),
  inputProcessors: [
    new LanguageDetector({
      model: env.LLM_MODEL_SMALL,
      targetLanguages: ["Spanish", "es"],
      threshold: 0.8,
      strategy: "translate",
      translationQuality: "quality",
      preserveOriginal: true,
    }),
  ],
});
