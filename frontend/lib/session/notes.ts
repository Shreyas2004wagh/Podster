"use client";

const STORAGE_KEY_PREFIX = "podster.notes.";

function getStorageKey(sessionId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

function normalizeNotes(notes: string) {
  return notes.replace(/\r\n/g, "\n");
}

export function saveSessionNotes(sessionId: string, notes: string) {
  if (typeof window === "undefined") return;

  const normalizedNotes = normalizeNotes(notes);
  const storageKey = getStorageKey(sessionId);

  if (!normalizedNotes.trim()) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(normalizedNotes));
}

export function getSessionNotes(sessionId: string) {
  if (typeof window === "undefined") return "";

  const raw = window.localStorage.getItem(getStorageKey(sessionId));
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "string") {
      window.localStorage.removeItem(getStorageKey(sessionId));
      return "";
    }
    return normalizeNotes(parsed);
  } catch {
    window.localStorage.removeItem(getStorageKey(sessionId));
    return "";
  }
}
