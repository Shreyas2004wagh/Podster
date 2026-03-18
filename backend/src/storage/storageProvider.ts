export interface MultipartUploadRequest {
  key: string;
  partCount: number;
}

export interface MultipartUploadResponse {
  uploadId: string;
  urls: string[];
}

export interface CompleteUploadRequest {
  key: string;
  uploadId: string;
  parts: Array<{ etag: string; partNumber: number }>;
}

export interface DownloadUrlRequest {
  key: string;
  expiresInSeconds?: number;
}

export interface StorageHealthInfo {
  provider: "s3" | "r2" | "local";
  bucket: string;
  region: string;
}

export interface IStorageProvider {
  createMultipartUpload(request: MultipartUploadRequest): Promise<MultipartUploadResponse>;
  completeMultipartUpload(request: CompleteUploadRequest): Promise<void>;
  getSignedDownloadUrl(request: DownloadUrlRequest): Promise<string>;
  checkHealth(): Promise<StorageHealthInfo>;
}
