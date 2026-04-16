import type { UploadWorkerMessage, UploadWorkerResponse } from "@/workers/upload-worker";

export interface UploadJob {
  id: string;
  url: string;
  blob: Blob;
}

export class UploadWorkerClient {
  private worker: Worker | null = null;
  private listeners: Array<(payload: UploadWorkerResponse) => void> = [];
  private initializationError: string | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      if (typeof Worker === "undefined") {
        this.initializationError =
          "Background uploads are not available in this browser because Web Workers are unsupported.";
        return;
      }

      try {
        this.worker = new Worker(new URL("../../workers/upload-worker.ts", import.meta.url));
      } catch (error) {
        this.initializationError =
          error instanceof Error
            ? `Background uploads are unavailable: ${error.message}`
            : "Background uploads are unavailable in this browser.";
        return;
      }

      this.worker.onmessage = (event: MessageEvent<UploadWorkerResponse>) => {
        this.listeners.forEach((fn) => fn(event.data));
      };
    }
  }

  isAvailable() {
    return this.worker !== null;
  }

  getInitializationError() {
    return this.initializationError;
  }

  onMessage(listener: (payload: UploadWorkerResponse) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((registeredListener) => registeredListener !== listener);
    };
  }

  upload(uploads: UploadJob[]) {
    const worker = this.worker;
    if (uploads.length === 0 || !worker) {
      return;
    }

    worker.postMessage({
      type: "upload-chunks",
      uploads
    } satisfies UploadWorkerMessage);
  }

  dispose() {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners = [];
  }
}
