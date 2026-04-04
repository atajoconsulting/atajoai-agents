import { env } from "@atajoai/shared";

async function mastraFetch(path: string, options?: RequestInit) {
  const url = `${env.MASTRA_INTERNAL_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mastra API error (${response.status}): ${text}`);
  }

  return response;
}

export async function invalidateConfigCache(): Promise<void> {
  await mastraFetch("/config/invalidate", { method: "POST" });
}

export async function testChatwootConnection(): Promise<{ ok: boolean; error?: string }> {
  const res = await mastraFetch("/config/test-chatwoot", { method: "POST" });
  return res.json();
}

export async function enqueueUrlIndexDocument(input: {
  documentId: string;
  title?: string;
  url: string;
}): Promise<void> {
  await mastraFetch("/documents/index-url", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function enqueueFileIndexDocument(input: {
  documentId: string;
  fileName: string;
  s3Key: string;
  sourceType: "pdf" | "docx" | "txt";
  title?: string;
}): Promise<void> {
  await mastraFetch("/documents/index-file", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function enqueueDeleteDocument(documentId: string): Promise<void> {
  await mastraFetch(`/documents/${documentId}`, {
    method: "DELETE",
  });
}
