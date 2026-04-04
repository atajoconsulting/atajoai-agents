import { NextResponse } from "next/server";
import { prisma } from "@atajoai/db";
import { enqueueDeleteDocument } from "@/lib/mastra-api";
import { getRequestSession, hasWriteAccess } from "@/lib/request-auth";

type Context = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: Context) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasWriteAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const document = await prisma.indexedDocument.findUnique({ where: { id } });
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  await prisma.indexedDocument.update({
    where: { id },
    data: {
      status: "deleting",
      errorMessage: null,
    },
  });

  try {
    await enqueueDeleteDocument(id);
  } catch (error) {
    await prisma.indexedDocument.update({
      where: { id },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    return NextResponse.json({ error: "No se pudo encolar el borrado" }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
