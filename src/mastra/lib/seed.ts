import { prisma } from "./db/prisma";
import { DEFAULT_APP_CONFIG_ID } from "./config";
import { DEFAULT_CONFIG } from "./default-config";

export async function seedDefaultConfig(): Promise<void> {
  try {
    await prisma.appConfig.upsert({
      where: { id: DEFAULT_APP_CONFIG_ID },
      create: {
        id: DEFAULT_APP_CONFIG_ID,
        orgName: DEFAULT_CONFIG.orgName,
        orgPhone: DEFAULT_CONFIG.orgPhone,
        orgSchedule: DEFAULT_CONFIG.orgSchedule,
        orgAddress: DEFAULT_CONFIG.orgAddress,
        orgWebsite: DEFAULT_CONFIG.orgWebsite,
        orgEOffice: DEFAULT_CONFIG.orgEOffice,
        preferredLang: DEFAULT_CONFIG.preferredLang,
        responseStyle: DEFAULT_CONFIG.responseStyle,
        llmModel: DEFAULT_CONFIG.llmModel,
        llmModelMedium: DEFAULT_CONFIG.llmModelMedium,
        llmModelSmall: DEFAULT_CONFIG.llmModelSmall,
        embedModel: DEFAULT_CONFIG.embedModel,
        retrievalTopK: DEFAULT_CONFIG.retrievalTopK,
        retrievalFinalK: DEFAULT_CONFIG.retrievalFinalK,
        greetingMessage: DEFAULT_CONFIG.greetingMessage,
        outOfScopeMessage: DEFAULT_CONFIG.outOfScopeMessage,
        enableHandoff: DEFAULT_CONFIG.enableHandoff,
      },
      update: {},
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[seed] Failed to seed default config: ${msg}\n`);
  }
}
