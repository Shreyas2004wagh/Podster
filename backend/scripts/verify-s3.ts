import { S3Client, ListBucketsCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

// Manual env loading to ensure we are grabbing from the .env file in the current directory if needed, 
// though dotenv/config should handle it if running from backend root.

const config = {
    region: process.env.STORAGE_REGION,
    endpoint: process.env.STORAGE_ENDPOINT,
    credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY || "",
        secretAccessKey: process.env.STORAGE_SECRET_KEY || "",
    },
    bucket: process.env.STORAGE_BUCKET,
};

console.log("Testing S3 Connection with config:");
console.log({
    ...config,
    credentials: { accessKeyId: config.credentials.accessKeyId, secretAccessKey: "***" }
});

async function main() {
    if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
        console.error("❌ Missing Credentials in environment variables.");
        process.exit(1);
    }

    const client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: config.credentials,
        forcePathStyle: true, // Often needed for compatible S3 providers like MinIO, but usually harmless for AWS
    });

    // 1. Try to list buckets (Validation of connection in general)
    try {
        console.log("Attempting to list buckets...");
        const data = await client.send(new ListBucketsCommand({}));
        console.log("✅ Successfully listed buckets!");
        console.log("Buckets found:", data.Buckets?.map(b => b.Name).join(", ") || "None");
    } catch (err: any) {
        console.warn("\n⚠️  Could not list buckets. (Access Denied expected if only granted bucket-level access)");
        if (err.$metadata) {
            console.warn(`   Http Status: ${err.$metadata.httpStatusCode}`);
        }
        console.warn(`   Error: ${err.message}\n`);
    }

    // 2. Check specific bucket (Validation of specific access)
    if (config.bucket) {
        console.log(`Checking specifically for bucket: ${config.bucket}...`);
        try {
            await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
            console.log(`✅ Bucket '${config.bucket}' exists and is accessible.`);
        } catch (err: any) {
            console.error(`\n❌ Could not access bucket '${config.bucket}'.`);
            console.error("Error Name:", err.name);
            console.error("Error Message:", err.message);
            if (err.$metadata) {
                console.error("Http Status:", err.$metadata.httpStatusCode);
            }
            process.exit(1);
        }
    } else {
        console.log("No specific bucket configured to check.");
    }
}

main();
