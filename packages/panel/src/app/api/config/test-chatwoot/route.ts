import { NextResponse } from "next/server";
import { testChatwootConnection } from "@/lib/mastra-api";
import { getRequestSession, hasWriteAccess } from "@/lib/request-auth";

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasWriteAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await testChatwootConnection();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
