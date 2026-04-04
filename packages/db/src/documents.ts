export type DocumentSourceType = "pdf" | "docx" | "txt";

export const DOCUMENT_SOURCE_TYPES: readonly DocumentSourceType[] = [
  "pdf",
  "docx",
  "txt",
];

const MAX_SIZE_BYTES = 20 * 1024 * 1024;

const SIGNATURES: Record<DocumentSourceType, [number, number[]][]> = {
  pdf: [[0, [0x25, 0x50, 0x44, 0x46]]],
  docx: [[0, [0x50, 0x4b, 0x03, 0x04]]],
  txt: [],
};

const SOURCE_TYPE_TO_CONTENT_TYPE: Record<DocumentSourceType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export function contentTypeFromSourceType(
  sourceType: DocumentSourceType,
): string {
  return SOURCE_TYPE_TO_CONTENT_TYPE[sourceType];
}

export function inferSourceType(
  contentType: string,
  fileName: string,
): DocumentSourceType | null {
  for (const [type, ct] of Object.entries(SOURCE_TYPE_TO_CONTENT_TYPE)) {
    if (contentType === ct) return type as DocumentSourceType;
  }

  const ext = fileName.toLowerCase().split(".").pop();
  if (ext && DOCUMENT_SOURCE_TYPES.includes(ext as DocumentSourceType)) {
    return ext as DocumentSourceType;
  }

  return null;
}

export function validateDocumentBuffer(
  buffer: Buffer,
  sourceType: DocumentSourceType,
): { ok: true } | { ok: false; error: string } {
  if (buffer.length > MAX_SIZE_BYTES) {
    return { ok: false, error: "El archivo supera el limite de 20MB" };
  }

  for (const [offset, bytes] of SIGNATURES[sourceType]) {
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[offset + i] !== bytes[i]) {
        return {
          ok: false,
          error: "El contenido del archivo no coincide con el tipo declarado",
        };
      }
    }
  }

  return { ok: true };
}
