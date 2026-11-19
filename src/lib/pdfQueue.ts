"use client";
// PDF saving queue: click "save" on as many books as you like; two are saved at a time, and the
// queue keeps going while she moves around pine studio (the tab just has to stay open).
import { useEffect, useState } from "react";
import { saveFromLink, uploadTextbook } from "./textbooks";
import type { Resource } from "./types";

type Pdf = NonNullable<Resource["pdf"]>;
type Task = { id: string; title: string; link?: string; file?: File; done: (pdf: Pdf) => void };
export type PdfState = { state: "queued" | "saving" | "error"; note: string };

const queue: Task[] = [];
const status = new Map<string, PdfState>();
const listeners = new Set<() => void>();
let running = 0;
const PARALLEL = 2;
const emit = () => listeners.forEach((f) => f());

function pump() {
  while (running < PARALLEL && queue.length) {
    const t = queue.shift()!;
    running++;
    status.set(t.id, { state: "saving", note: "starting…" });
    emit();
    const progress = (note: string) => {
      status.set(t.id, { state: "saving", note });
      emit();
    };
    (t.file ? uploadTextbook(t.file, progress) : saveFromLink(t.link!, t.title, progress))
      .then((pdf) => {
        t.done(pdf);
        status.delete(t.id);
      })
      .catch((e) => status.set(t.id, { state: "error", note: (e as Error).message }))
      .finally(() => {
        running--;
        emit();
        pump();
      });
  }
}

// Ask before the tab closes while PDFs are still saving (the queue lives in this tab).
let guarded = false;
function guard() {
  if (guarded || typeof window === "undefined") return;
  guarded = true;
  window.addEventListener("beforeunload", (e) => {
    if (running > 0 || queue.length > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

export function enqueuePdf(task: Task) {
  guard();
  if (queue.some((q) => q.id === task.id) || status.get(task.id)?.state === "saving") return;
  queue.push(task);
  status.set(task.id, { state: "queued", note: "waiting…" });
  emit();
  pump();
}

export function clearPdfError(id: string) {
  if (status.get(id)?.state === "error") {
    status.delete(id);
    emit();
  }
}

export const pdfBusy = () => running > 0 || queue.length > 0;

export function usePdfQueue() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { status, busy: running + queue.length };
}
