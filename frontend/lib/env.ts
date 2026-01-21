import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000")
});

export const env = schema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL
});
