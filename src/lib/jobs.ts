"use client";
// Long Claude jobs (research, slides, review, fact-check) keep running if she moves to another
// step or page; this remembers which are running so the "working" circle shows when she returns.
import { useEffect, useState } from "react";

type Job = { started: number; error?: string; stage?: string };
const jobs = new Map<string, Job>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function useJob(key: string) {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  const job = jobs.get(key);
  return {
    running: !!job && !job.error,
    started: job?.started,
    stage: job?.stage ?? "",
    setStage: (stage: string) => {
      const j = jobs.get(key);
      if (j) {
        jobs.set(key, { ...j, stage });
        emit();
      }
    },
    error: job?.error ?? "",
    clearError: () => {
      if (jobs.get(key)?.error) {
        jobs.delete(key);
        emit();
      }
    },
    async run(fn: () => Promise<void>) {
      if (jobs.get(key) && !jobs.get(key)!.error) return;
      jobs.set(key, { started: Date.now() });
      emit();
      try {
        await fn();
        jobs.delete(key);
      } catch (e) {
        jobs.set(key, { started: 0, error: (e as Error).message });
      }
      emit();
    },
  };
}

// ── Picking up results a closed or reloaded page missed ───────────────────────
type Rec = { status: "running" | "done" | "failed"; started: string; data?: unknown; error?: string; meta?: unknown };

export function forget(key: string) {
  import("./client").then(({ api }) => api(`/api/result?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => {}));
}

/** If the server holds a finished result for this job, apply it; if it is still running, wait for it. */
export async function recover(key: string, apply: (data: unknown, meta: unknown) => void) {
  if (jobs.has(key)) return;
  const { api, getStatus } = await import("./client");
  if (!(await getStatus()).db) return;
  const get = async () => (await api<{ result: Rec | null }>(`/api/result?key=${encodeURIComponent(key)}`)).result;
  let r: Rec | null;
  try {
    r = await get();
  } catch {
    return;
  }
  if (!r) return;
  const started = Date.parse(r.started) || Date.now();
  if (r.status === "running") {
    if (Date.now() - started > 6 * 60_000) return forget(key); // gave up long ago
    jobs.set(key, { started });
    emit();
    while (r && r.status === "running" && Date.now() - started < 6 * 60_000) {
      await new Promise((ok) => setTimeout(ok, 8000));
      try {
        r = await get();
      } catch {
        /* try again */
      }
    }
  }
  if (r?.status === "done") {
    apply(r.data, r.meta);
    jobs.delete(key);
  } else jobs.set(key, { started: 0, error: r?.error || "That job didn't finish. Please try again." });
  emit();
  forget(key);
}

/** Run a job outside a component (e.g. "make my class"), with a stage label the page can show. */
export async function runJob(key: string, fn: (stage: (s: string) => void) => Promise<void>): Promise<boolean> {
  if (jobs.get(key) && !jobs.get(key)!.error) return false;
  jobs.set(key, { started: Date.now() });
  emit();
  try {
    await fn((stage) => {
      const j = jobs.get(key);
      if (j) {
        jobs.set(key, { ...j, stage });
        emit();
      }
    });
    jobs.delete(key);
    emit();
    return true;
  } catch (e) {
    jobs.set(key, { started: 0, error: (e as Error).message });
    emit();
    return false;
  }
}
