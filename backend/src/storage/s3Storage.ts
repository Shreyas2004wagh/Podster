import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  UploadPartCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import type {
  CompleteUploadRequest,
  MultipartUploadRequest,
  MultipartUploadResponse,
  StorageProvider
} from "./storageProvider";

export class S3StorageProvider implements StorageProvider {
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY,
        secretAccessKey: env.STORAGE_SECRET_KEY
      },
      forcePathStyle: true // Needed for MinIO
    });
  }

  async createMultipartUpload(request: MultipartUploadRequest): Promise<MultipartUploadResponse> {
    const createCommand = new CreateMultipartUploadCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: request.key
    });

    const output = await this.s3.send(createCommand);
    const uploadId = output.UploadId;

    if (!uploadId) {
      throw new Error("Failed to initiate multipart upload");
    }

    // Generate signed URLs for each part
    const urls = await Promise.all(
      Array.from({ length: request.partCount }).map((_, idx) => {
        const partNumber = idx + 1;
        const command = new UploadPartCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: request.key,
          UploadId: uploadId,
          PartNumber: partNumber
        });
        return getSignedUrl(this.s3, command, { expiresIn: 3600 });
      })
    );

    return {
      uploadId,
      urls
    };
  }

  async completeMultipartUpload(request: CompleteUploadRequest): Promise<void> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: env.STORAGE_BUCKET,
      Key: request.key,
      UploadId: request.uploadId,
      MultipartUpload: {
        Parts: request.parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({
            ETag: p.etag,
            PartNumber: p.partNumber
          }))
      }
    });

    await this.s3.send(command);
  }
}

