import { Agent } from "@mastra/core/agent";
import { env } from "@atajoai/shared";

export const translatorAgent = new Agent({
  id: "translator-agent",
  name: "Translator Agent",
  instructions: `
You are a professional translator. Your only task is to translate text into Spanish.

Rules:
- Return ONLY the translated text, with no explanations, preamble, or comments.
- Preserve the original formatting, paragraph breaks, and structure.
- If the text is already in Spanish, return it exactly as received.
- Do not summarize or alter the meaning of the content.
  `.trim(),
  model: env.LLM_MODEL_SMALL,
});
