"use client";
// Making classes one after another (semester planner "add & make them"), with pause and stop.
// Pause and stop take effect between steps (research → slides → fact-check): a step already running
// on the server always finishes and is kept, so nothing half-made is lost.
import { useEffect, useState } from "react";
import { load, save } from "./client";
import { runJob } from "./jobs";
import { makeClass } from "./make";
import type { Lesson } from "./types";

const QKEY = "pine.makequeue";
export class Stopped extends Error {
  constructor() {
    super("Stopped — what was made so far is kept.");
  }
}

export type QueueState = { running: boolean; paused: boolean; stopping: boolean; left: number; current?: string };
let state: QueueState = { running: false, paused: false, stopping: false, left: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<QueueState>) => {
  state = { ...state, ...p };
  listeners.forEach((f) => f());
};
const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Between steps: wait while paused; throw Stopped if she pressed stop. */
async function gate() {
  while (state.paused && !state.stopping) await sleep(400);
  if (state.stopping) throw new Stopped();
}

export const queued = () => load<string[]>(QKEY, []);

/** Add classes to the queue and work through it (only one runner at a time). */
export async function startQueue(ids: string[], getLesson: (id: string) => Lesson | undefined, setLesson: (id: string, fn: (l: Lesson) => Lesson) => void, courseOf: (l: Lesson) => string) {
  const queue = [...new Set([...queued(), ...ids])];
  save(QKEY, queue);
  set({ left: queue.length });
  if (state.running) return;
  set({ running: true, paused: false, stopping: false });
  try {
    while (queued().length && !state.stopping) {
      const q = queued();
      const id = q[0];
      set({ left: q.length, current: id });
      const l = getLesson(id);
      if (l && !(l.slides.length && l.research)) {
        await runJob(`make:${id}`, async (stage) => {
          try {
            await makeClass(l, courseOf(l), (fn) => setLesson(id, fn), stage, gate);
          } catch (e) {
            if (!(e instanceof Stopped)) throw e; // stopping isn't an error
          }
        });
      }
      if (state.stopping) break;
      save(QKEY, queued().filter((x) => x !== id));
    }
  } finally {
    if (state.stopping) save(QKEY, []);
    set({ running: false, paused: false, stopping: false, left: 0, current: undefined });
  }
}

export const pauseQueue = () => set({ paused: true });
export const resumeQueue = () => set({ paused: false });
export const stopQueue = () => set({ stopping: true, paused: false });
export const clearQueue = () => save(QKEY, []);
export const saveQueue = (ids: string[]) => save(QKEY, ids);

export function useMakeQueue() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return state;
}

// ── One class ("make my class" in Prep): stop between steps ──────────────────
const stopOne = new Set<string>();
export const stopMaking = (lessonId: string) => stopOne.add(lessonId);
export const oneGate = (lessonId: string) => {
  stopOne.delete(lessonId);
  return async () => {
    if (stopOne.has(lessonId)) {
      stopOne.delete(lessonId);
      throw new Stopped();
    }
  };
};
