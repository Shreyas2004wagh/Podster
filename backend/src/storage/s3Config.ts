const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export const MULTIPART_EXPOSED_RESPONSE_HEADERS = ["ETag"] as const;

export function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

export function resolveForcePathStyle({
  endpoint,
  provider,
  forcePathStyle
}: {
  endpoint?: string;
  provider: "s3" | "r2" | "local";
  forcePathStyle?: boolean;
}) {
  if (forcePathStyle !== undefined) {
    return forcePathStyle;
  }

  if (provider === "local") {
    return true;
  }

  if (!endpoint) {
    return false;
  }

  const normalizedEndpoint = endpoint.toLowerCase();
  return normalizedEndpoint.includes("localhost") || normalizedEndpoint.includes("127.0.0.1");
}

export function resolveCorsAllowedOrigins(frontendOrigin: string) {
  return Array.from(
    new Set(
      frontendOrigin
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    )
  );
}
