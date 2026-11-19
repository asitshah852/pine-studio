// Shared storage (Upstash Redis via Vercel → Storage). Without it, everything is kept in the
// browser on this device only, and the app says so.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const dbConfigured = () => Boolean(url && token);
let r: Redis | null = null;
export const db = () => (r ??= new Redis({ url: url!, token: token! }));
export const K = (name: string) => `pine:${name}`;

export const COLLECTIONS = ["courses", "resources", "lessons", "feedback", "research"] as const;
