/// <reference lib="webworker" />

export type UploadWorkerMessage =
  | {
    type: "upload-chunks";
    uploads: Array<{ id: string; url: string; blob: Blob }>;
  }
  | { type: "ping" };

export type UploadWorkerResponse =
  | { type: "progress"; id: string; progress: number }
  | { type: "completed"; id: string; etag: string }
  | { type: "error"; id: string; message: string }
  | { type: "pong" };

const concurrentUploads = 3;
const maxRetries = 2;
const MISSING_ETAG_MESSAGE =
  "Upload succeeded but the storage response did not expose an ETag header. Configure bucket CORS to expose ETag for multipart uploads.";

function uploadChunk(job: { id: string; url: string; blob: Blob }) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", job.url);

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) {
        return;
      }

      const progress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      self.postMessage({ type: "progress", id: job.id, progress } satisfies UploadWorkerResponse);
    };

    request.onerror = () => reject(new Error("Network error during upload"));
    request.onabort = () => reject(new Error("Upload aborted"));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Upload failed: ${request.status} ${request.statusText}`));
        return;
      }

      const etag = request.getResponseHeader("ETag")?.replace(/"/g, "");
      if (!etag) {
        reject(new Error(MISSING_ETAG_MESSAGE));
        return;
      }

      resolve(etag);
    };

    request.send(job.blob);
  });
}

self.onmessage = async (event: MessageEvent<UploadWorkerMessage>) => {
  if (event.data.type === "ping") {
    self.postMessage({ type: "pong" } satisfies UploadWorkerResponse);
    return;
  }

  if (event.data.type === "upload-chunks") {
    const queue = [...event.data.uploads];

    const uploadOne = async (job: { id: string; url: string; blob: Blob }) => {
      try {
        let attempt = 0;
        let lastError: Error | null = null;
        while (attempt <= maxRetries) {
          try {
            const etag = await uploadChunk(job);
            self.postMessage({ type: "completed", id: job.id, etag } satisfies UploadWorkerResponse);
            return;
          } catch (err) {
            lastError = err as Error;
            const delay = 500 * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            attempt += 1;
          }
        }
        throw lastError ?? new Error("Upload failed");
      } catch (err) {
        self.postMessage({
          type: "error",
          id: job.id,
          message: (err as Error).message
        } satisfies UploadWorkerResponse);
      }
    };

    const runQueueWorker = async () => {
      while (true) {
        const next = queue.shift();
        if (!next) return;
        await uploadOne(next);
      }
    };

    const workerCount = Math.min(concurrentUploads, queue.length);
    await Promise.all(Array.from({ length: workerCount }, () => runQueueWorker()));
  }
};

export default {};
