import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST_JWT_SECRET: z.string().min(8).default("podster-host-secret"),
  GUEST_JWT_SECRET: z.string().min(8).default("podster-guest-secret"),
  STORAGE_ENDPOINT: z.string().default(""),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_ACCESS_KEY: z.string().default(""),
  STORAGE_SECRET_KEY: z.string().default(""),
  STORAGE_BUCKET: z.string().default("podster"),
  STORAGE_PROVIDER: z.enum(["s3", "r2", "local"]).default("local")
});

export const env = envSchema.parse(process.env);
