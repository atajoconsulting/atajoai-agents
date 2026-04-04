import { Agent } from "@mastra/core/agent";
import type { MastraMemory } from "@mastra/core/memory";
import { Memory } from "@mastra/memory";
import { env } from "@atajoai/shared";
import { getConfigSync } from "../lib/config";
import { buildRouterInstructions, buildResponderInstructions } from "../lib/instructions";
import { CitizenChannelOutputProcessor } from "../processors/citizen-channel-output-processor";

const DEFAULT_CONFIG = {
  orgName: "Ayuntamiento",
  orgPhone: "010",
  orgSchedule: "lunes a viernes de 9:00 a 14:00",
  orgAddress: "Plaza Mayor, 1",
  orgWebsite: "https://www.ayuntamiento.es",
  orgEOffice: null,
  preferredLang: "es",
  channel: "whatsapp",
  responseStyle: "brief_structured",
  customInstructions: null,
  greetingMessage: null,
  outOfScopeMessage: null,
} as const;

function resolveConfig() {
  return getConfigSync() ?? DEFAULT_CONFIG;
}

// Shared memory instance — all pipeline agents use the same threadId/resourceId
// so they see conversation history automatically via Mastra's input processors.
//
// Type cast rationale: @mastra/memory's Memory class implements MastraMemory, but pnpm
// may resolve @mastra/core to different physical paths for this package vs @mastra/memory,
// making private-field types structurally incompatible at compile time even though the
// runtime instance is fully valid. Running `pnpm dedupe` in the project root is the
// permanent fix; the cast is safe until then.
export const sharedMemory = new Memory({
  options: {
    lastMessages: 6,
    semanticRecall: false,
  },
}) as unknown as MastraMemory;

export const chatwootRouterAgent = new Agent({
  id: "chatwoot-router-agent",
  name: "Chatwoot Router Agent",
  instructions: () => buildRouterInstructions(resolveConfig() as any),
  model: env.LLM_MODEL_SMALL,
  memory: sharedMemory,
  defaultOptions: {
    modelSettings: {
      temperature: 0,
    },
  },
});

export const chatwootResponderAgent = new Agent({
  id: "chatwoot-responder-agent",
  name: "Chatwoot Responder Agent",
  instructions: () => buildResponderInstructions(resolveConfig() as any),
  model: env.LLM_MODEL,
  memory: sharedMemory,
  defaultOptions: {
    modelSettings: {
      temperature: 0.1,
      maxOutputTokens: 350,
    },
  },
  outputProcessors: [new CitizenChannelOutputProcessor()],
  maxProcessorRetries: 1,
});
