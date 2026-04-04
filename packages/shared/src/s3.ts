import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "./env";

let sharedS3Client: S3Client | undefined;

export function getSharedS3Client(): S3Client {
  if (!sharedS3Client) {
    sharedS3Client = new S3Client({
      region: env.AWS_REGION,
      forcePathStyle: true,
    });
  }

  return sharedS3Client;
}

export async function putObjectBuffer(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await getSharedS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await getSharedS3Client().send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`S3 object "${key}" does not have a body`);
  }

  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteObjectByKey(key: string): Promise<void> {
  await getSharedS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}
