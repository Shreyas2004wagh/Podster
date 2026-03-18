import "dotenv/config";
import { randomBytes } from "node:crypto";
import { z } from "zod";

const generatedSecrets = {
  host: randomBytes(32).toString("hex"),
  guest: randomBytes(32).toString("hex"),
  cookie: randomBytes(32).toString("hex")
};

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

  // CORS / cookies
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECRET: z.string().min(32).default(generatedSecrets.cookie)
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
});

export const env = envSchema.parse(process.env);
