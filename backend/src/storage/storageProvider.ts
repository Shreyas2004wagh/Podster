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

export interface IStorageProvider {
  createMultipartUpload(request: MultipartUploadRequest): Promise<MultipartUploadResponse>;
  completeMultipartUpload(request: CompleteUploadRequest): Promise<void>;
}
