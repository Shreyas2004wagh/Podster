import type { Session, SessionId } from "@podster/shared";
import { apiFetch } from "@/lib/api/client";

export interface CreateSessionResponse {
  session: Session;
  hostToken: string;
  guestToken: string;
}

export async function createSession(input: { title: string }): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>("/sessions", { method: "POST", json: input });
}

export async function joinSession(sessionId: SessionId, payload: { guestName: string }) {
  return apiFetch<{ token: string }>(`/sessions/${sessionId}/join`, {
    method: "POST",
    json: payload
  });
}

export async function getSession(sessionId: SessionId) {
  return apiFetch<Session>(`/sessions/${sessionId}`);
}

export async function requestUploadUrls(
  sessionId: SessionId,
  partCount: number
) {
  return apiFetch<{ urls: string[]; uploadId: string }>(`/sessions/${sessionId}/upload-urls`, {
    method: "POST",
    json: { partCount }
  });
}

export async function completeUpload(
  sessionId: SessionId,
  payload: { uploadId: string; parts: Array<{ etag: string; partNumber: number }> }
) {
  return apiFetch<Session>(`/sessions/${sessionId}/complete-upload`, {
    method: "POST",
    json: payload
  });
}

export async function startSession(sessionId: SessionId) {
  return apiFetch<Session>(`/sessions/${sessionId}/start`, {
    method: "POST"
  });
}

export async function getDownloadUrl(
  sessionId: SessionId,
  trackId: string
) {
  return apiFetch<{ url: string }>(`/sessions/${sessionId}/tracks/${trackId}/download`, {
    method: "GET"
  });
}
