import "dotenv/config";
import { randomBytes } from "crypto";
import { S3StorageProvider } from "../src/storage/s3Storage.js";

const TEST_KEY = `test-uploads/${Date.now()}-test.bin`;

async function main() {
  console.log("Starting upload flow test...");

  try {
    const storage = new S3StorageProvider();

    console.log(`\n1. Requesting signed URL for key: ${TEST_KEY}`);
    const { uploadId, urls } = await storage.createMultipartUpload({
      key: TEST_KEY,
      partCount: 1
    });

    if (!urls[0]) {
      throw new Error("No signed URL returned");
    }

    console.log(`   Upload ID: ${uploadId}`);
    console.log(`   Signed URL: ${urls[0].slice(0, 50)}...`);

    console.log("\n2. Simulating client upload...");
    const response = await fetch(urls[0], {
      method: "PUT",
      body: randomBytes(1024 * 1024)
    });

    if (!response.ok) {
      console.error("   Upload failed.");
      console.error(`   Status: ${response.status} ${response.statusText}`);
      console.error(`   Body: ${await response.text()}`);
      process.exit(1);
    }

    const etag = response.headers.get("etag")?.replace(/"/g, "");
    console.log(`   Upload successful. ETag: ${etag}`);

    if (!etag) {
      throw new Error(
        "Upload succeeded but no ETag header was exposed. Configure bucket CORS to expose ETag."
      );
    }

    console.log("\n3. Completing multipart upload...");
    await storage.completeMultipartUpload({
      key: TEST_KEY,
      uploadId,
      parts: [{ partNumber: 1, etag }]
    });

    console.log("   Upload completed successfully.");
    console.log("\nFull flow verified: backend -> signed URL -> client upload -> backend completion");
  } catch (error) {
    console.error("\nTest failed");
    console.error(error);
    process.exit(1);
  }
}

void main();
