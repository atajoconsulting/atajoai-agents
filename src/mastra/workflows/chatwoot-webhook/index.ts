import { createWorkflow } from "@mastra/core/workflows";
import { chatwootWebhookSchema } from "./schemas";
import { sendReplyOutputSchema } from "./steps/send-reply";
import { validateWebhook } from "./steps/validate-webhook";
import { routeMessage } from "./steps/route-message";
import { retrieveContext } from "./steps/retrieve-context";
import { judgeAnswerability } from "./steps/judge-answerability";
import { composeCitizenReply } from "./steps/compose-reply";
import { sanitizeReply } from "./steps/sanitize-reply";
import { sendReply } from "./steps/send-reply";

const chatwootWebhookWorkflow = createWorkflow({
  id: "chatwoot-webhook",
  inputSchema: chatwootWebhookSchema,
  outputSchema: sendReplyOutputSchema,
})
  .then(validateWebhook)
  .then(routeMessage)
  .then(retrieveContext)
  .then(judgeAnswerability)
  .then(composeCitizenReply)
  .then(sanitizeReply)
  .then(sendReply);

chatwootWebhookWorkflow.commit();

export { chatwootWebhookWorkflow };
