import type { UploadWorkerMessage, UploadWorkerResponse } from "@/workers/upload-worker";

export interface UploadJob {
  id: string;
  url: string;
  blob: Blob;
}

export class UploadWorkerClient {
  private worker: Worker | null = null;
  private listeners: Array<(payload: UploadWorkerResponse) => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.worker = new Worker(new URL("../../workers/upload-worker.ts", import.meta.url));
      this.worker.onmessage = (event: MessageEvent<UploadWorkerResponse>) => {
        this.listeners.forEach((fn) => fn(event.data));
      };
    }
  }

  onMessage(listener: (payload: UploadWorkerResponse) => void) {
    this.listeners.push(listener);
  }

  upload(uploads: UploadJob[]) {
    this.worker?.postMessage({
      type: "upload-chunks",
      uploads
    } satisfies UploadWorkerMessage);
  }

  dispose() {
    this.worker?.terminate();
    this.listeners = [];
  }
}
