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

self.onmessage = async (event: MessageEvent<UploadWorkerMessage>) => {
  if (event.data.type === "ping") {
    self.postMessage({ type: "pong" } satisfies UploadWorkerResponse);
    return;
  }

  if (event.data.type === "upload-chunks") {
    const queue = [...event.data.uploads];
    const workers: Promise<void>[] = [];

    const uploadOne = async (job: { id: string; url: string; blob: Blob }) => {
      try {
        let attempt = 0;
        let lastError: Error | null = null;
        while (attempt <= maxRetries) {
          try {
            const response = await fetch(job.url, {
              method: "PUT",
              body: job.blob
            });

            if (!response.ok) {
              throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
            }

            const etag = response.headers.get("ETag")?.replace(/"/g, "") || "";
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

    while (queue.length > 0 && workers.length < concurrentUploads) {
      const job = queue.shift();
      if (job) workers.push(uploadOne(job));
    }

    await Promise.all(
      workers.map(async (workerPromise) => {
        await workerPromise;
        const next = queue.shift();
        if (next) {
          await uploadOne(next);
        }
      })
    );
  }
};

export default {};
