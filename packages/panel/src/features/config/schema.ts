import { z } from "zod";

export const configFormSchema = z.object({
  orgName: z.string().min(1),
  orgPhone: z.string().nullable(),
  orgSchedule: z.string().nullable(),
  orgAddress: z.string().nullable(),
  orgWebsite: z.string().nullable(),
  orgEOffice: z.string().nullable(),
  preferredLang: z.string().min(1),
  channel: z.string().min(1),
  responseStyle: z.string().min(1),
  customInstructions: z.string().nullable(),
  greetingMessage: z.string().nullable(),
  outOfScopeMessage: z.string().nullable(),
  llmModel: z.string().nullable(),
  llmModelMedium: z.string().nullable(),
  llmModelSmall: z.string().nullable(),
  embedModel: z.string().nullable(),
  retrievalTopK: z.coerce.number().int().min(1).max(50),
  retrievalFinalK: z.coerce.number().int().min(1).max(20),
  chatwootBaseUrl: z.string().url().nullable().or(z.literal("")),
  chatwootApiToken: z.string().nullable().optional(),
  enableHandoff: z.boolean(),
  handoffTeamId: z.coerce.number().int().nullable(),
  handoffAssigneeId: z.coerce.number().int().nullable(),
});

export type ConfigFormValues = z.infer<typeof configFormSchema>;
