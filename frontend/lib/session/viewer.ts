"use client";

export interface ViewerSession {
  sessionId: string;
  userId: string;
  role: "host" | "guest";
  name: string;
}

const STORAGE_KEY_PREFIX = "podster.viewer.";

function getStorageKey(sessionId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}`;
}

export function saveViewerSession(viewer: ViewerSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(viewer.sessionId), JSON.stringify(viewer));
}

export function getViewerSession(sessionId: string): ViewerSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getStorageKey(sessionId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ViewerSession;
  } catch {
    window.localStorage.removeItem(getStorageKey(sessionId));
    return null;
  }
}
