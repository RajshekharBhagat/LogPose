import { z } from "zod";

const envSchema = z.object({
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    MONGODB_URI: z.string().min(1),
});

export const env = envSchema.parse(process.env);