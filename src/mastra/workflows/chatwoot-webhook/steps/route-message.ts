import { createStep } from "@mastra/core/workflows";
import { routeMessageResultSchema } from "../../../lib/outbound";
import { logStepMetrics, extractTokenUsage } from "../../../lib/metrics";
import { validationResultSchema, routedResultSchema } from "../schemas";
import { getDefaultRoute, LLM_TIMEOUT_MS } from "../helpers";

export const routeMessage = createStep({
  id: "route-message",
  description: "Classifies the incoming message and rewrites the search query if retrieval is needed",
  inputSchema: validationResultSchema,
  outputSchema: routedResultSchema,
  execute: async ({ inputData, mastra }) => {
    const t0 = Date.now();
    const logger = mastra?.getLogger();

    if (!inputData.shouldProcess) {
      return {
        ...inputData,
        route: getDefaultRoute(),
        searchQuery: inputData.messageContent,
      };
    }

    const router = mastra?.getAgent("chatwootRouterAgent");
    if (!router) {
      throw new Error("Chatwoot router agent not found");
    }

    const memoryOptions = {
      thread: inputData.threadId,
      resource: inputData.resourceId,
      options: { lastMessages: 4, readOnly: true },
    };

    const response = await router.generate(
      [
        {
          role: "user",
          content: `Clasifique el siguiente mensaje ciudadano.\n\nMensaje: ${inputData.messageContent}`,
        },
      ],
      {
        maxSteps: 1,
        memory: memoryOptions,
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        structuredOutput: {
          schema: routeMessageResultSchema,
        },
      },
    );

    const route = routeMessageResultSchema.parse(response.object);

    // Rewrite the search query if retrieval is needed
    let searchQuery = inputData.messageContent;
    if (route.requiresRetrieval) {
      const rewriteResponse = await router.generate(
        [
          {
            role: "user",
            content: [
              "Reescribe la siguiente consulta ciudadana como una busqueda autocontenida.",
              "Si la consulta hace referencia a mensajes anteriores de la conversacion, resuelve las referencias para que la busqueda sea comprensible sin contexto previo.",
              "Si la consulta ya es autocontenida, devuelvela tal cual.",
              "Devuelve solo el texto de busqueda, sin explicaciones.",
              `\nConsulta: ${inputData.messageContent}`,
            ].join("\n"),
          },
        ],
        {
          maxSteps: 1,
          memory: memoryOptions,
          abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
          modelSettings: { temperature: 0, maxOutputTokens: 100 },
        },
      );
      searchQuery = rewriteResponse.text.trim() || inputData.messageContent;
    }

    if (logger) {
      logStepMetrics(logger, "route-message", {
        durationMs: Date.now() - t0,
        tokensUsed: extractTokenUsage(response),
        extra: { intent: route.intent },
      });
    }

    return { ...inputData, route, searchQuery };
  },
});
