import { prisma } from "./client";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";
import type { Prisma } from "@prisma/client";

export async function getAppConfig() {
  let config = await prisma.appConfig.findUnique({ where: { id: 1 } });

  if (!config) {
    config = await prisma.appConfig.create({ data: { id: 1 } });
  }

  if (config.chatwootApiToken && env.ENCRYPTION_KEY) {
    try {
      config = {
        ...config,
        chatwootApiToken: decrypt(
          config.chatwootApiToken,
          env.ENCRYPTION_KEY,
        ),
      };
    } catch {
      // Token might not be encrypted yet (migration from plaintext)
    }
  }

  return config;
}

export async function updateAppConfig(data: Prisma.AppConfigUpdateInput) {
  const updateData = { ...data };

  if (typeof updateData.chatwootApiToken === "string" && env.ENCRYPTION_KEY) {
    updateData.chatwootApiToken = encrypt(
      updateData.chatwootApiToken,
      env.ENCRYPTION_KEY,
    );
  }

  return prisma.appConfig.upsert({
    where: { id: 1 },
    update: updateData,
    create: { id: 1, ...updateData } as Prisma.AppConfigCreateInput,
  });
}
