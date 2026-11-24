// A safe place for the result of a long job (research, slides, review, fact-check).
// The server writes it here before replying, so if the page was closed or reloaded meanwhile,
// the result is picked up the next time the class is opened. Kept for 7 days.
import { after } from "next/server";
import { db, dbConfigured, K } from "./db";

export type JobRecord = { status: "running" | "done" | "failed"; started: string; finished?: string; data?: unknown; error?: string; meta?: unknown };
const TTL = 7 * 86400;
const key = (k: string) => K(`result:${k}`);
export const validKey = (k: unknown): k is string => typeof k === "string" && /^(research|slides|review|check|chat|pdf|quiz|plan|planchat|talk):[\w-]{1,64}$/.test(k);

/** Run a job and keep its outcome; without the shared database it just runs. */
export async function keep<T>(jobKey: unknown, meta: unknown, fn: () => Promise<T>): Promise<T> {
  if (!validKey(jobKey) || !dbConfigured()) return fn();
  const started = new Date().toISOString();
  await db().set(key(jobKey), { status: "running", started, meta } satisfies JobRecord, { ex: TTL });
  try {
    const data = await fn();
    await db().set(key(jobKey), { status: "done", started, finished: new Date().toISOString(), data, meta } satisfies JobRecord, { ex: TTL });
    return data;
  } catch (e) {
    await db().set(key(jobKey), { status: "failed", started, error: (e as Error).message, meta } satisfies JobRecord, { ex: TTL });
    throw e;
  }
}

export const readResult = (k: string) => db().get<JobRecord>(key(k));
export const clearResult = (k: string) => db().del(key(k));

/** Run a long job in the background: reply "queued" at once, keep working after the reply (Vercel
 *  keeps the function alive), and store the outcome for the page to collect — even if it was closed.
 *  Without the shared database it simply runs while the page waits. */
export async function background<T>(jobKey: unknown, meta: unknown, fn: () => Promise<T>): Promise<T | { queued: true; jobKey: string }> {
  if (!validKey(jobKey) || !dbConfigured()) return fn();
  const started = new Date().toISOString();
  await db().set(key(jobKey), { status: "running", started, meta } satisfies JobRecord, { ex: TTL });
  after(async () => {
    try {
      const data = await fn();
      await db().set(key(jobKey), { status: "done", started, finished: new Date().toISOString(), data, meta } satisfies JobRecord, { ex: TTL });
    } catch (e) {
      await db().set(key(jobKey), { status: "failed", started, error: (e as Error).message, meta } satisfies JobRecord, { ex: TTL });
    }
  });
  return { queued: true, jobKey };
}
