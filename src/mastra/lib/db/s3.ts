import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "../../env";

export const s3 = new S3Client({
  region: env.AWS_REGION,
  ...(env.AWS_ENDPOINT_URL_S3
    ? { endpoint: env.AWS_ENDPOINT_URL_S3, forcePathStyle: true }
    : {}),
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.S3_BUCKET;

export async function uploadObject(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ...(contentType ? { ContentType: contentType } : {}),
    }),
  );
}

export async function downloadObject(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );

  const stream = response.Body;
  if (!stream) {
    throw new Error(`S3 object ${key} has no body`);
  }

  // Node.js SDK returns a Readable stream
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  );
}
