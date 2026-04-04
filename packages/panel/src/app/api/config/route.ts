import { NextResponse } from "next/server";
import { getAppConfig, updateAppConfig } from "@atajoai/shared";
import { configFormSchema } from "@/features/config/schema";
import { invalidateConfigCache } from "@/lib/mastra-api";
import { getRequestSession, hasWriteAccess } from "@/lib/request-auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getAppConfig();
  return NextResponse.json({
    config: { ...config, chatwootApiToken: null },
    hasToken: Boolean(config.chatwootApiToken),
  });
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasWriteAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = configFormSchema.partial().safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const { chatwootApiToken, ...rest } = payload.data;
  const updateData =
    chatwootApiToken === null
      ? { ...rest, chatwootApiToken: null }
      : chatwootApiToken
        ? { ...rest, chatwootApiToken }
        : rest;

  const config = await updateAppConfig(updateData);
  await invalidateConfigCache();

  return NextResponse.json({ config: { ...config, chatwootApiToken: null } });
}
