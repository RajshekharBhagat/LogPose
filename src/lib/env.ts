import { z } from "zod";

function clean(value: unknown): unknown {
    if (typeof value !== "string") return value;
    let next = value.trim();
    if (
        (next.startsWith('"') && next.endsWith('"')) ||
        (next.startsWith("'") && next.endsWith("'"))
    ) {
        next = next.slice(1, -1).trim();
    }
    return next;
}

const envSchema = z.object({
    GITHUB_CLIENT_ID: z.string().min(1),
    GITHUB_CLIENT_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    MONGODB_URI: z.string().min(1),
});

const raw = {
    GITHUB_CLIENT_ID: clean(process.env.GITHUB_CLIENT_ID),
    GITHUB_CLIENT_SECRET: clean(process.env.GITHUB_CLIENT_SECRET),
    NEXTAUTH_URL: clean(process.env.NEXTAUTH_URL),
    NEXTAUTH_SECRET: clean(process.env.NEXTAUTH_SECRET),
    GEMINI_API_KEY: clean(process.env.GEMINI_API_KEY),
    MONGODB_URI: clean(process.env.MONGODB_URI),
};

export const env = envSchema.parse(raw);