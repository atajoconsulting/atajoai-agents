import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

let sharedS3Client: S3Client | undefined;
let resolvedBucket: string | undefined;

function getS3Region(): string {
  const region = process.env.AWS_REGION;
  if (!region) {
    throw new Error("AWS_REGION environment variable is required");
  }
  return region;
}

function getS3Bucket(): string {
  if (!resolvedBucket) {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      throw new Error("S3_BUCKET environment variable is required");
    }
    resolvedBucket = bucket;
  }

  return resolvedBucket;
}

export const S3_BUCKET = process.env.S3_BUCKET ?? "";

export function getSharedS3Client(): S3Client {
  if (!sharedS3Client) {
    sharedS3Client = new S3Client({
      region: getS3Region(),
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
      Bucket: getS3Bucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const response = await getSharedS3Client().send(
    new GetObjectCommand({
      Bucket: getS3Bucket(),
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
      Bucket: getS3Bucket(),
      Key: key,
    }),
  );
}
