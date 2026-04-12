"use client";

import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem
} from "@/lib/browser/localStorage";

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
  const raw = getLocalStorageItem(storageKey);
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "string") {
      removeLocalStorageItem(storageKey);
      return "";
    }
    return normalizeNotes(parsed);
  } catch {
    removeLocalStorageItem(storageKey);
    return "";
  }
}

export function saveSessionNotes(sessionId: string, userId: string, notes: string) {
  if (typeof window === "undefined") return;

  const normalizedNotes = normalizeNotes(notes);
  const storageKey = getStorageKey(sessionId, userId);
  const legacyStorageKey = getLegacyStorageKey(sessionId);

  removeLocalStorageItem(legacyStorageKey);

  if (!normalizedNotes.trim()) {
    removeLocalStorageItem(storageKey);
    return;
  }

  setLocalStorageItem(storageKey, JSON.stringify(normalizedNotes));
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
    setLocalStorageItem(storageKey, JSON.stringify(legacyNotes));
    removeLocalStorageItem(legacyStorageKey);
  }

  return legacyNotes;
}
