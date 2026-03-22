"use client";

import { z } from "zod";

export interface ViewerSession {
  sessionId: string;
  userId: string;
  role: "host" | "guest";
  name: string;
}

const viewerSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  role: z.enum(["host", "guest"]),
  name: z.string().trim().min(1)
});

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
    const parsed = viewerSessionSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.sessionId !== sessionId) {
      window.localStorage.removeItem(getStorageKey(sessionId));
      return null;
    }
    return parsed.data;
  } catch {
    window.localStorage.removeItem(getStorageKey(sessionId));
    return null;
  }
}
