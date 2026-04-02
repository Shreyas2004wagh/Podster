import "dotenv/config";
import { PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../src/config/env.js";
import {
  MULTIPART_EXPOSED_RESPONSE_HEADERS,
  resolveCorsAllowedOrigins,
  resolveForcePathStyle
} from "../src/storage/s3Config.js";

async function main() {
  const allowedOrigins = resolveCorsAllowedOrigins(env.FRONTEND_ORIGIN);
  const s3 = new S3Client({
    region: env.STORAGE_REGION,
    endpoint: env.STORAGE_ENDPOINT || undefined,
    credentials: {
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY
    },
    forcePathStyle: resolveForcePathStyle({
      endpoint: env.STORAGE_ENDPOINT || undefined,
      provider: env.STORAGE_PROVIDER,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE
    })
  });

  console.log(`Configuring CORS for bucket: ${env.STORAGE_BUCKET}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`Exposed headers: ${MULTIPART_EXPOSED_RESPONSE_HEADERS.join(", ")}`);

  try {
    await s3.send(
      new PutBucketCorsCommand({
        Bucket: env.STORAGE_BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["*"],
              AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
              AllowedOrigins: allowedOrigins,
              ExposeHeaders: [...MULTIPART_EXPOSED_RESPONSE_HEADERS],
              MaxAgeSeconds: 3600
            }
          ]
        }
      })
    );

    console.log("CORS configuration applied successfully.");
  } catch (error) {
    console.error("Failed to configure CORS:", error);
    process.exitCode = 1;
  }
}

void main();
