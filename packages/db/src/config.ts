import { prisma } from "./client";
import { decrypt, encrypt } from "./crypto";
import type { Prisma } from "@prisma/client";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export async function getAppConfig() {
  let config = await prisma.appConfig.findUnique({ where: { id: 1 } });

  if (!config) {
    config = await prisma.appConfig.create({ data: { id: 1 } });
  }

  if (config.chatwootApiToken && ENCRYPTION_KEY) {
    try {
      config = {
        ...config,
        chatwootApiToken: decrypt(config.chatwootApiToken, ENCRYPTION_KEY),
      };
    } catch {
      // Token might not be encrypted yet (migration from plaintext)
    }
  }

  return config;
}

export async function updateAppConfig(data: Prisma.AppConfigUpdateInput) {
  const updateData = { ...data };

  if (typeof updateData.chatwootApiToken === "string" && ENCRYPTION_KEY) {
    updateData.chatwootApiToken = encrypt(
      updateData.chatwootApiToken,
      ENCRYPTION_KEY,
    );
  }

  return prisma.appConfig.upsert({
    where: { id: 1 },
    update: updateData,
    create: { id: 1, ...updateData } as Prisma.AppConfigCreateInput,
  });
}
