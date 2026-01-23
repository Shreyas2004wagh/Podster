import "dotenv/config";
import { S3StorageProvider } from "../src/storage/s3Storage";
import { randomBytes } from "crypto";

// Mocking the MultipartUploadRequest interface from storageProvider
// We need to ensure we match the interface expected by S3StorageProvider
const TEST_KEY = `test-uploads/${Date.now()}-test.bin`;
const PART_SIZE = 5 * 1024 * 1024; // 5MB (minimum for S3 multipart)
// We will use a smaller size for testing if the provider allows, but S3 standard is 5MB. 
// However, for a single chunk upload via signed URL, we can often get away with less if it's just one part.
// But createMultipartUpload implies we are doing multipart.
// Let's try a small single part first.

async function main() {
    console.log("🚀 Starting Upload Flow Test...");

    try {
        const storage = new S3StorageProvider();

        // 1. Get Signed URLs
        console.log(`\n1️⃣ Requesting Signed URL for key: ${TEST_KEY}`);
        const { uploadId, urls } = await storage.createMultipartUpload({
            key: TEST_KEY,
            partCount: 1,
        });

        console.log(`   Upload ID: ${uploadId}`);
        console.log(`   Signed URL: ${urls[0].substring(0, 50)}...`);

        if (!urls[0]) throw new Error("No signed URL returned");

        // 2. Upload Data
        console.log("\n2️⃣ Simulating Client Upload...");
        const fileContent = randomBytes(1024 * 1024); // 1MB dummy file

        const response = await fetch(urls[0], {
            method: "PUT",
            body: fileContent,
            headers: {
                // S3 signed URLs often require the exact headers signed. 
                // Our backend implementation might just sign the method/url.
                // If content-type or length was signed, we'd need it here.
            }
        });

        if (!response.ok) {
            console.error("   ❌ Upload Failed!");
            console.error(`   Status: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`   Body: ${text}`);
            process.exit(1);
        }

        const etag = response.headers.get("etag")?.replace(/"/g, ""); // Remove quotes
        console.log(`   ✅ Upload Successful! ETag: ${etag}`);

        if (!etag) {
            console.warn("   ⚠️ No ETag returned, checking if we can proceed without it (some providers might behave differently)");
        }

        // 3. Complete Upload
        console.log("\n3️⃣ Completing Multipart Upload...");
        await storage.completeMultipartUpload({
            key: TEST_KEY,
            uploadId,
            parts: [{ partNumber: 1, etag: etag || "" }]
        });

        console.log("   ✅ Upload Completed Successfully!");
        console.log("\n🎉 Full Flow Verified: Backend -> Signed URL -> Client Upload -> Backend Completion");

    } catch (err: any) {
        console.error("\n❌ Test Failed");
        console.error(err);
        process.exit(1);
    }
}

main();
