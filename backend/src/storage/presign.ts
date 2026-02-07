import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageObjectNotFoundError, StorageProviderError } from "./errors.js";

interface GeneratePresignedGetUrlInput {
  client: S3Client;
  bucket: string;
  key: string;
  expiresInSeconds: number;
  contentType?: string;
}

function isObjectNotFoundError(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) {
    return false;
  }

  return (
    error.name === "NoSuchKey" ||
    error.name === "NotFound" ||
    error.$metadata?.httpStatusCode === 404
  );
}

export async function generatePresignedGetUrl(input: GeneratePresignedGetUrlInput): Promise<string> {
  const { client, bucket, key, expiresInSeconds, contentType } = input;

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
  } catch (error) {
    if (isObjectNotFoundError(error)) {
      throw new StorageObjectNotFoundError(key, error);
    }
    throw new StorageProviderError("Failed to verify object in storage", error);
  }

  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: contentType
      }),
      { expiresIn: expiresInSeconds }
    );
  } catch (error) {
    throw new StorageProviderError("Failed to generate presigned URL", error);
  }
}
