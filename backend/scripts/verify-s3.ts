import "dotenv/config";
import { HeadBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../src/config/env.js";
import { resolveForcePathStyle } from "../src/storage/s3Config.js";

const config = {
  region: env.STORAGE_REGION,
  endpoint: env.STORAGE_ENDPOINT || undefined,
  credentials: {
    accessKeyId: env.STORAGE_ACCESS_KEY,
    secretAccessKey: env.STORAGE_SECRET_KEY
  },
  bucket: env.STORAGE_BUCKET,
  forcePathStyle: resolveForcePathStyle({
    endpoint: env.STORAGE_ENDPOINT || undefined,
    provider: env.STORAGE_PROVIDER,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE
  })
};

console.log("Testing S3 connection with config:");
console.log({
  ...config,
  credentials: {
    accessKeyId: config.credentials.accessKeyId,
    secretAccessKey: "***"
  }
});

async function main() {
  if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    console.error("Missing storage credentials in environment variables.");
    process.exit(1);
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: config.credentials,
    forcePathStyle: config.forcePathStyle
  });

  try {
    console.log("Attempting to list buckets...");
    const data = await client.send(new ListBucketsCommand({}));
    console.log("Successfully listed buckets.");
    console.log("Buckets found:", data.Buckets?.map((bucket) => bucket.Name).join(", ") || "None");
  } catch (error) {
    const err = error as { $metadata?: { httpStatusCode?: number }; message?: string };
    console.warn("\nCould not list buckets. Access denied is expected for bucket-scoped credentials.");
    if (err.$metadata?.httpStatusCode) {
      console.warn(`HTTP status: ${err.$metadata.httpStatusCode}`);
    }
    console.warn(`Error: ${err.message ?? "Unknown error"}\n`);
  }

  if (!config.bucket) {
    console.log("No specific bucket configured to check.");
    return;
  }

  console.log(`Checking access to bucket: ${config.bucket}...`);
  try {
    await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    console.log(`Bucket '${config.bucket}' exists and is accessible.`);
  } catch (error) {
    const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    console.error(`Could not access bucket '${config.bucket}'.`);
    console.error("Error name:", err.name ?? "UnknownError");
    console.error("Error message:", err.message ?? "Unknown error");
    if (err.$metadata?.httpStatusCode) {
      console.error("HTTP status:", err.$metadata.httpStatusCode);
    }
    process.exit(1);
  }
}

void main();
