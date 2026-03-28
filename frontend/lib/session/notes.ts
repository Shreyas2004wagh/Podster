"use client";

const STORAGE_KEY_PREFIX = "podster.notes.";

function getStorageKey(sessionId: string, userId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}.${userId}`;
}

function getLegacyStorageKey(sessionId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function normalizeNotes(notes: string) {
  return notes.replace(/\r\n/g, "\n");
}

function readStoredNotes(storageKey: string) {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "string") {
      window.localStorage.removeItem(storageKey);
      return "";
    }
    return normalizeNotes(parsed);
  } catch {
    window.localStorage.removeItem(storageKey);
    return "";
  }
}

export function saveSessionNotes(sessionId: string, userId: string, notes: string) {
  if (typeof window === "undefined") return;

  const normalizedNotes = normalizeNotes(notes);
  const storageKey = getStorageKey(sessionId, userId);
  const legacyStorageKey = getLegacyStorageKey(sessionId);

  window.localStorage.removeItem(legacyStorageKey);

  if (!normalizedNotes.trim()) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(normalizedNotes));
}

export function getSessionNotes(sessionId: string, userId: string) {
  if (typeof window === "undefined") return "";

  const storageKey = getStorageKey(sessionId, userId);
  const scopedNotes = readStoredNotes(storageKey);
  if (scopedNotes) {
    return scopedNotes;
  }

  const legacyStorageKey = getLegacyStorageKey(sessionId);
  const legacyNotes = readStoredNotes(legacyStorageKey);
  if (legacyNotes) {
    window.localStorage.setItem(storageKey, JSON.stringify(legacyNotes));
    window.localStorage.removeItem(legacyStorageKey);
  }

  return legacyNotes;
}
