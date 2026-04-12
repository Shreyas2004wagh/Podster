import { UPLOAD_PART_SIZE_BYTES } from "@podster/shared";

const DB_NAME = "podster-recordings";
const STORE_NAME = "chunks";
const DB_VERSION = 3;

export interface StoredChunk {
  sessionId: string;
  partNumber: number;
  blob: Blob;
  createdAt: number;
  userId: string;
}

async function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(error);
      return;
    }

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ["sessionId", "userId", "partNumber"] });
      }
    };
  });
}

export async function saveChunk(sessionId: string, chunk: Omit<StoredChunk, "sessionId">) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.objectStore(STORE_NAME).put({ sessionId, ...chunk });
  });
}

export async function listChunks(sessionId: string, userId: string): Promise<StoredChunk[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll(IDBKeyRange.bound([sessionId, userId, 0], [sessionId, userId, Infinity]));
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      const items = (request.result as StoredChunk[]).sort((a, b) => a.partNumber - b.partNumber);
      db.close();
      resolve(items);
    };
  });
}

export async function clearChunks(sessionId: string, userId: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor(
      IDBKeyRange.bound([sessionId, userId, 0], [sessionId, userId, Infinity])
    );
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

export function buildUploadParts(chunks: StoredChunk[], size = UPLOAD_PART_SIZE_BYTES): Blob[] {
  const parts: Blob[] = [];
  let currentPart: Blob[] = [];
  let currentSize = 0;

  for (const chunk of chunks) {
    const chunkSize = chunk.blob.size;

    if (currentPart.length > 0 && currentSize + chunkSize > size) {
      parts.push(new Blob(currentPart, { type: currentPart[0]?.type || chunk.blob.type }));
      currentPart = [];
      currentSize = 0;
    }

    currentPart.push(chunk.blob);
    currentSize += chunkSize;
  }

  if (currentPart.length > 0) {
    parts.push(new Blob(currentPart, { type: currentPart[0]?.type || "video/webm" }));
  }

  return parts;
}
