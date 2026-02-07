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

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
