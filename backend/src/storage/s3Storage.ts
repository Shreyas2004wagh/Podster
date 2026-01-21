import { env } from "../config/env";
import type {
  CompleteUploadRequest,
  MultipartUploadRequest,
  MultipartUploadResponse,
  StorageProvider
} from "./storageProvider";

/**
 * Placeholder S3-compatible storage provider.
 * Swap with AWS S3 or Cloudflare R2 clients; signatures are respected by route handlers.
 */
export class S3StorageProvider implements StorageProvider {
  async createMultipartUpload(request: MultipartUploadRequest): Promise<MultipartUploadResponse> {
    // TODO: Use AWS SDK to create multipart upload and pre-sign URLs.
    const urls = Array.from({ length: request.partCount }).map(
      (_value, idx) =>
        `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}/${request.key}?partNumber=${
          idx + 1
        }&uploadId=placeholder`
    );
    return {
      uploadId: crypto.randomUUID(),
      urls
    };
  }

  async completeMultipartUpload(_request: CompleteUploadRequest): Promise<void> {
    // TODO: Call S3 CompleteMultipartUpload. No-op for now.
    return;
  }
}
