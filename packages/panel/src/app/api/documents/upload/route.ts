import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  prisma,
  putObjectBuffer,
  contentTypeFromSourceType,
  inferSourceType,
  validateDocumentBuffer,
} from "@atajoai/shared";
import { enqueueFileIndexDocument } from "@/lib/mastra-api";
import { getRequestSession, hasWriteAccess } from "@/lib/request-auth";

function createDocumentKey(documentId: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `documents/${documentId}/${safeFileName}`;
}

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasWriteAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibio ningun archivo" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceType = inferSourceType(file.type, file.name);
  if (!sourceType) {
    return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 });
  }

  const validation = validateDocumentBuffer(buffer, sourceType);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const contentType = file.type || contentTypeFromSourceType(sourceType);
  const title = file.name.replace(/\.[^.]+$/, "");
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const document = await prisma.indexedDocument.create({
    data: {
      source: file.name,
      sourceType,
      title,
      status: "pending",
      contentHash,
    },
  });

  const s3Key = createDocumentKey(document.id, file.name);

  try {
    await putObjectBuffer({ key: s3Key, body: buffer, contentType });

    await prisma.indexedDocument.update({
      where: { id: document.id },
      data: { s3Key },
    });

    await enqueueFileIndexDocument({
      documentId: document.id,
      fileName: file.name,
      s3Key,
      sourceType,
      title,
    });
  } catch (error) {
    await prisma.indexedDocument.update({
      where: { id: document.id },
      data: {
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });

    return NextResponse.json({ error: "No se pudo subir o encolar el archivo" }, { status: 502 });
  }

  return NextResponse.json({ documentId: document.id }, { status: 202 });
}
