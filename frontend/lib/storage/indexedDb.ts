import { UPLOAD_PART_SIZE_BYTES } from "@podster/shared";

const DB_NAME = "podster-recordings";
const STORE_NAME = "chunks";
const DB_VERSION = 1;

export interface StoredChunk {
  sessionId: string;
  partNumber: number;
  blob: Blob;
  createdAt: number;
  userId: string;
}

async function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: ["sessionId", "partNumber"] });
      }
    };
  });
}

export async function saveChunk(sessionId: string, chunk: Omit<StoredChunk, "sessionId">) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put({ sessionId, ...chunk });
  });
}

export async function listChunks(sessionId: string): Promise<StoredChunk[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));
    request.onsuccess = () => {
      const items = (request.result as StoredChunk[]).sort((a, b) => a.partNumber - b.partNumber);
      resolve(items);
    };
  });
}

export async function clearChunks(sessionId: string) {
  const db = await getDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE_NAME);
    const request = store.openCursor(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

export function splitBlob(blob: Blob, size = UPLOAD_PART_SIZE_BYTES): Blob[] {
  const parts: Blob[] = [];
  let offset = 0;
  while (offset < blob.size) {
    parts.push(blob.slice(offset, offset + size));
    offset += size;
  }
  return parts;
}
