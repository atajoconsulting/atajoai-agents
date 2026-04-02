import {
  BaseProcessor,
  type ProcessOutputResultArgs,
  type ProcessOutputStepArgs,
} from "@mastra/core/processors";
import {
  evaluateOutboundReply,
  normalizeOutboundReply,
} from "../lib/outbound";

function replaceAssistantText(
  messages: ProcessOutputResultArgs["messages"],
  nextText: string,
) {
  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    const parts = message.content.parts.map((part) =>
      part.type === "text" ? { ...part, text: nextText } : part,
    );

    const hasTextPart = parts.some((part) => part.type === "text");

    return {
      ...message,
      content: {
        ...message.content,
        content: nextText,
        parts: hasTextPart
          ? parts
          : [{ type: "text" as const, text: nextText }, ...parts],
      },
    };
  });
}

export class CitizenChannelOutputProcessor extends BaseProcessor<"citizen-channel-output"> {
  readonly id = "citizen-channel-output";

  async processOutputStep({
    text,
    abort,
    retryCount,
  }: ProcessOutputStepArgs): Promise<ProcessOutputStepArgs["messages"]> {
    const evaluation = evaluateOutboundReply(text ?? "");

    if (!evaluation.isSafeForOutbound && retryCount < 1) {
      abort(
        [
          "La salida no cumple las reglas del canal ciudadano.",
          `Problema detectado: ${evaluation.reason}.`,
          "Reescriba la respuesta como texto simple, breve, factual y sin JSON, tool calls ni markdown complejo.",
        ].join(" "),
        { retry: true, metadata: { evaluation } },
      );
    }

    return [];
  }

  async processOutputResult({
    messages,
    result,
  }: ProcessOutputResultArgs): Promise<ProcessOutputResultArgs["messages"]> {
    const normalizedText = normalizeOutboundReply(result.text);

    if (!normalizedText || normalizedText === result.text) {
      return messages;
    }

    return replaceAssistantText(messages, normalizedText);
  }
}
