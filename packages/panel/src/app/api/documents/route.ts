import { NextResponse } from "next/server";
import { prisma } from "@atajoai/db";
import { documentUrlSchema } from "@/features/documents/schema";
import { enqueueUrlIndexDocument } from "@/lib/mastra-api";
import { getRequestSession, hasWriteAccess } from "@/lib/request-auth";

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await prisma.indexedDocument.findMany({
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ documents });
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasWriteAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = documentUrlSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: payload.error.flatten() }, { status: 400 });
  }

  const document = await prisma.indexedDocument.create({
    data: {
      source: payload.data.url,
      sourceType: "web",
      title: payload.data.title,
      status: "pending",
    },
  });

  try {
    await enqueueUrlIndexDocument({
      documentId: document.id,
      title: document.title ?? undefined,
      url: document.source,
    });
  } catch (error) {
    await prisma.indexedDocument.update({
      where: { id: document.id },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    return NextResponse.json({ error: "No se pudo encolar la indexación" }, { status: 502 });
  }

  return NextResponse.json({ document }, { status: 202 });
}
