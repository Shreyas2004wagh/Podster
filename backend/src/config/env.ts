import "dotenv/config";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { parseOptionalBoolean } from "../storage/s3Config.js";

const generatedSecrets = {
  host: randomBytes(32).toString("hex"),
  guest: randomBytes(32).toString("hex"),
  cookie: randomBytes(32).toString("hex")
};

function parseCommaSeparatedList(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST_JWT_SECRET: z.string().min(32).default(generatedSecrets.host),
  GUEST_JWT_SECRET: z.string().min(32).default(generatedSecrets.guest),
  HOST_JWT_TTL: z.string().min(2).default("8h"),
  GUEST_JWT_TTL: z.string().min(2).default("8h"),

  // Logging configuration
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  
  // Database configuration
  DATABASE_URL: z.string().default("postgresql://podster:podster@localhost:5432/podster"),
  DATABASE_POOL_SIZE: z.coerce.number().default(20),
  DATABASE_TIMEOUT: z.coerce.number().default(30000),
  
  // Storage configuration
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ACCESS_KEY: z.string().default(""),
  STORAGE_SECRET_KEY: z.string().default(""),
  STORAGE_BUCKET: z.string().default("podster"),
  STORAGE_PROVIDER: z.enum(["s3", "r2", "local"]).default("s3"),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseOptionalBoolean(value);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_FORCE_PATH_STYLE"],
          message: error instanceof Error ? error.message : "Invalid boolean value"
        });
        return z.NEVER;
      }
    }),

  // CORS / cookies
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  COOKIE_SECRET: z.string().min(32).default(generatedSecrets.cookie),
  COOKIE_DOMAIN: z.string().trim().optional(),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax")
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (env.HOST_JWT_SECRET === generatedSecrets.host) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["HOST_JWT_SECRET"],
      message: "HOST_JWT_SECRET must be explicitly configured in production"
    });
  }

  if (env.GUEST_JWT_SECRET === generatedSecrets.guest) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GUEST_JWT_SECRET"],
      message: "GUEST_JWT_SECRET must be explicitly configured in production"
    });
  }

  if (env.COOKIE_SECRET === generatedSecrets.cookie) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SECRET"],
      message: "COOKIE_SECRET must be explicitly configured in production"
    });
  }

  if (env.DATABASE_URL === "postgresql://podster:podster@localhost:5432/podster") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["DATABASE_URL"],
      message: "DATABASE_URL must be explicitly configured in production"
    });
  }

  if (env.FRONTEND_ORIGIN === "http://localhost:3000") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["FRONTEND_ORIGIN"],
      message: "FRONTEND_ORIGIN must be explicitly configured in production"
    });
  }

  if (env.STORAGE_BUCKET === "podster") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["STORAGE_BUCKET"],
      message: "STORAGE_BUCKET must be explicitly configured in production"
    });
  }

  if (env.STORAGE_PROVIDER !== "local") {
    if (!env.STORAGE_ACCESS_KEY.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_ACCESS_KEY"],
        message: "STORAGE_ACCESS_KEY is required in production"
      });
    }

    if (!env.STORAGE_SECRET_KEY.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_SECRET_KEY"],
        message: "STORAGE_SECRET_KEY is required in production"
      });
    }
  }

  if (env.COOKIE_SAME_SITE === "none" && !env.COOKIE_DOMAIN?.trim() && !env.RENDER_EXTERNAL_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COOKIE_SAME_SITE"],
      message: "COOKIE_SAME_SITE=none requires COOKIE_DOMAIN or RENDER_EXTERNAL_URL in production"
    });
  }
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  FRONTEND_ORIGINS: parseCommaSeparatedList(parsedEnv.FRONTEND_ORIGIN)
};
