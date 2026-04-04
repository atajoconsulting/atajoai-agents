import mammoth from "mammoth";

export interface DocxExtractResult {
  text: string;
}

/**
 * Extracts plain text from a DOCX buffer using mammoth.
 */
export async function extractDocxText(buffer: Buffer): Promise<DocxExtractResult> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}
