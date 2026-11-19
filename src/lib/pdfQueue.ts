"use client";
// PDF saving queue: click "save" on as many books as you like; two are saved at a time, and the
// queue keeps going while she moves around pine studio (the tab just has to stay open).
import { useEffect, useState } from "react";
import { load, save, waitResult } from "./client";
import { saveFromLink, uploadTextbook } from "./textbooks";
import type { Resource } from "./types";

type Pdf = NonNullable<Resource["pdf"]>;
type Task = { id: string; title: string; link?: string; file?: File; done: (pdf: Pdf) => void };
export type PdfState = { state: "queued" | "saving" | "error"; note: string };

const queue: Task[] = [];
const status = new Map<string, PdfState>();
const listeners = new Set<() => void>();
let running = 0;
const uploading = new Set<string>(); // file uploads in progress (these need the tab open)
const PARALLEL = 2;
const emit = () => listeners.forEach((f) => f());

function pump() {
  while (running < PARALLEL && queue.length) {
    const t = queue.shift()!;
    running++;
    status.set(t.id, { state: "saving", note: "starting…" });
    emit();
    if (t.file) uploading.add(t.id);
    const progress = (note: string) => {
      if (!note.startsWith("uploading")) uploading.delete(t.id);
      status.set(t.id, { state: "saving", note });
      emit();
    };
    remember(t.id, true);
    (t.file ? uploadTextbook(t.file, progress, t.id) : saveFromLink(t.link!, t.title, progress, t.id))
      .then((pdf) => {
        t.done(pdf);
        status.delete(t.id);
        remember(t.id, false);
      })
      .catch((e) => {
        status.set(t.id, { state: "error", note: (e as Error).message });
        remember(t.id, false);
      })
      .finally(() => {
        uploading.delete(t.id);
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
    if (uploading.size > 0) {
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

// Books whose PDF is being saved on the server, remembered so a reopened page picks up the result.
const PENDING = "pine.pdfjobs";
function remember(id: string, on: boolean) {
  const list = new Set(load<string[]>(PENDING, []));
  if (on) list.add(id);
  else list.delete(id);
  save(PENDING, [...list]);
}

/** On opening the Library: collect PDFs that finished (or are still saving) while the page was closed. */
export function resumePdfs(done: (id: string, pdf: Pdf) => void) {
  for (const id of load<string[]>(PENDING, [])) {
    if (status.has(id)) continue;
    status.set(id, { state: "saving", note: "still saving in the background…" });
    emit();
    waitResult<Pdf>(`pdf:${id}`)
      .then((pdf) => {
        done(id, pdf);
        status.delete(id);
      })
      .catch((e) => status.set(id, { state: "error", note: (e as Error).message }))
      .finally(() => {
        remember(id, false);
        emit();
      });
  }
}
