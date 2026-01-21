import { env } from "@/lib/env";

interface RequestOptions extends RequestInit {
  json?: unknown;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options;
  const response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {})
    },
    body: json ? JSON.stringify(json) : rest.body
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
