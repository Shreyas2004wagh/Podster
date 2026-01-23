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
  partCount: number,
  token?: string
) {
  return apiFetch<{ urls: string[]; uploadId: string }>(`/sessions/${sessionId}/upload-urls`, {
    method: "POST",
    json: { partCount },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}

export async function completeUpload(
  sessionId: SessionId,
  payload: { uploadId: string },
  token?: string
) {
  return apiFetch<{ ok: true }>(`/sessions/${sessionId}/complete-upload`, {
    method: "POST",
    json: payload,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  });
}
