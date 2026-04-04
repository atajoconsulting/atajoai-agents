import { runEvals } from "@mastra/core/evals";
import { chatwootWebhookWorkflow } from "../workflows/chatwoot-webhook";
import { citizenChannelGoldenCases } from "./citizen-channel-golden-cases";
import {
  localChannelRuleScorer,
  localInfoAnswerRelevancyScorer,
  localInfoContextPrecisionScorer,
  localInfoFaithfulnessScorer,
  localInfoTrajectoryScorer,
} from "./local-info";

function buildWebhookInput(message: string) {
  return {
    event: "message_created",
    content: message,
    message_type: "incoming",
    private: false,
    sender: {
      id: 1,
      type: "contact",
      name: "Ciudadano de prueba",
    },
    account: {
      id: 1,
    },
    conversation: {
      id: 1,
    },
  };
}

function buildExpectedTrajectory() {
  return {
    steps: [
      { stepType: "workflow_step" as const, name: "validate-webhook" },
      { stepType: "workflow_step" as const, name: "route-message" },
      { stepType: "workflow_step" as const, name: "retrieve-context" },
      { stepType: "workflow_step" as const, name: "judge-answerability" },
      { stepType: "workflow_step" as const, name: "compose-citizen-reply" },
      { stepType: "workflow_step" as const, name: "sanitize-outbound-reply" },
      { stepType: "workflow_step" as const, name: "send-outbound-reply" },
    ],
    maxSteps: 7,
  };
}

export async function runLocalInfoWorkflowEvals() {
  return runEvals({
    target: chatwootWebhookWorkflow,
    data: citizenChannelGoldenCases.map((item) => ({
      input: buildWebhookInput(item.input),
      expectedTrajectory: buildExpectedTrajectory(),
    })),
    scorers: {
      steps: {
        "sanitize-outbound-reply": [
          localChannelRuleScorer,
          localInfoAnswerRelevancyScorer,
          localInfoFaithfulnessScorer,
          localInfoContextPrecisionScorer,
        ],
      },
      trajectory: [localInfoTrajectoryScorer],
    },
    concurrency: 1,
    targetOptions: {
      perStep: true,
    },
  });
}
