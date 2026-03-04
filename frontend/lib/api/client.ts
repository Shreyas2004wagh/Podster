import { env } from "@/lib/env";

interface RequestOptions extends RequestInit {
  json?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const resolvedHeaders = new Headers(headers ?? undefined);
  const body = json === undefined ? rest.body : JSON.stringify(json);

  if (json !== undefined && !resolvedHeaders.has("Content-Type")) {
    resolvedHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: resolvedHeaders,
    body
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { message?: string };
      throw new Error(payload.message || `Request failed: ${response.status}`);
    }
    const message = await response.text();
    throw new Error(message.trim() || `Request failed: ${response.status}`);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  const text = await response.text();
  return text as T;
}
