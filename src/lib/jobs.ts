"use client";
// Long Claude jobs (research, slides, review, fact-check) keep running if she moves to another
// step or page; this remembers which are running so the "working" circle shows when she returns.
import { useEffect, useState } from "react";

type Job = { started: number; error?: string };
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
