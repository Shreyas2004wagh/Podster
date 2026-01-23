import "dotenv/config";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { env } from "../src/config/env";

async function main() {
    const s3 = new S3Client({
        region: env.STORAGE_REGION,
        endpoint: env.STORAGE_ENDPOINT || undefined,
        credentials: {
            accessKeyId: env.STORAGE_ACCESS_KEY,
            secretAccessKey: env.STORAGE_SECRET_KEY
        }
    });

    const bucketName = env.STORAGE_BUCKET;

    console.log(`Configuring CORS for bucket: ${bucketName}...`);

    try {
        const command = new PutBucketCorsCommand({
            Bucket: bucketName,
            CORSConfiguration: {
                CORSRules: [
                    {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["PUT", "POST", "GET", "HEAD"], // Standard set
                        AllowedOrigins: ["http://localhost:3000", "*"], // Allow localhost and * for dev
                        ExposeHeaders: ["ETag"], // Critical for multipart uploads
                        MaxAgeSeconds: 3600
                    }
                ]
            }
        });

        await s3.send(command);
        console.log("✅ CORS configuration applied successfully!");
    } catch (err) {
        console.error("❌ Failed to configure CORS:", err);
    }
}

main();
