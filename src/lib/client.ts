"use client";
// Browser helpers: passcode, status, and collections that save to the shared studio database
// when it's set up, and always keep a copy in this browser.
import { useCallback, useEffect, useState } from "react";
import { diffIds, mergeLists } from "./merge";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the page still works */
  }
}

const PASS = "pine.passcode";
export const getPass = () => load<string>(PASS, "");
export const setPass = (v: string) => save(PASS, v.trim());

export type Status = { claude: boolean; db: boolean; passcode: boolean; email: boolean; youtube?: boolean; pdfs?: boolean; pdfUploads?: boolean };
let statusP: Promise<Status> | null = null;
export const getStatus = () =>
  (statusP ??= fetch("/api/status")
    .then((r) => r.json())
    .catch(() => ({ claude: false, db: false, passcode: false, email: false })));

export function useStatus() {
  const [s, set] = useState<Status | null>(null);
  useEffect(() => {
    getStatus().then(set);
  }, []);
  return s;
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const p = getPass();
  if (p) headers.set("x-pine-passcode", p);
  const res = await fetch(url, { ...init, headers });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401) {
    window.dispatchEvent(new Event("pine:need-passcode"));
    throw new Error(j.error ?? "Studio passcode needed.");
  }
  if (!res.ok) throw new Error(j.error ?? `Something went wrong (${res.status}).`);
  return j as T;
}

// ── Saving ───────────────────────────────────────────────────────────────
// Each list is kept in this browser at once and saved online ~0.8 s later. Before saving, the
// online copy is fetched and merged (see merge.ts), so two devices never wipe each other's work.
type Pending = { changed: Set<string>; deleted: Set<string> };
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, Pending>();
const latest = new Map<string, { id: string }[]>();
const lastPull = new Map<string, number>();
const pend = (name: string) => {
  if (!pending.has(name)) pending.set(name, { changed: new Set(), deleted: new Set() });
  return pending.get(name)!;
};
// Unsaved edits are also remembered in the browser, so closing the page mid-save loses nothing.
const PK = (name: string) => `pine.unsaved.${name}`;
const rememberPending = (name: string) => {
  const p = pending.get(name);
  save(PK(name), p && (p.changed.size || p.deleted.size) ? { changed: [...p.changed], deleted: [...p.deleted] } : null);
};
const broadcast = (name: string, value: unknown) =>
  queueMicrotask(() => window.dispatchEvent(new CustomEvent("pine:sync", { detail: { name, value } })));

async function flush(name: string) {
  const p = pending.get(name);
  const local = latest.get(name);
  if (!p || !local || (!p.changed.size && !p.deleted.size)) return;
  if (!(await getStatus()).db) return;
  pending.set(name, { changed: new Set(), deleted: new Set() }); // later edits collect afresh
  try {
    const r = await api<{ value: { id: string }[] | null }>(`/api/store/${name}`);
    const merged = mergeLists(Array.isArray(r.value) ? r.value : [], latest.get(name) ?? local, p.changed, p.deleted);
    await api(`/api/store/${name}`, { method: "PUT", body: JSON.stringify(merged) });
    rememberPending(name);
    const now = latest.get(name) ?? local;
    // Only adopt the merged list if nothing new was typed meanwhile (that will be merged next save).
    const q = pending.get(name)!;
    if (!q.changed.size && !q.deleted.size && JSON.stringify(merged) !== JSON.stringify(now)) {
      latest.set(name, merged);
      save(`pine.${name}`, merged);
      broadcast(name, merged);
    }
  } catch {
    // Couldn't reach the database: keep the changes queued and try again shortly.
    const q = pend(name);
    p.changed.forEach((id) => q.changed.add(id));
    p.deleted.forEach((id) => q.deleted.add(id));
    rememberPending(name);
    clearTimeout(timers.get(name));
    timers.set(name, setTimeout(() => flush(name), 15_000));
  }
}

/** Fetch the online copy (e.g. when she comes back to the tab) unless there are unsaved edits. */
async function pull(name: string) {
  if (Date.now() - (lastPull.get(name) ?? 0) < 5000) return;
  lastPull.set(name, Date.now());
  const p = pending.get(name);
  if (p && (p.changed.size || p.deleted.size)) return;
  if (!(await getStatus()).db) return;
  try {
    const r = await api<{ value: { id: string }[] | null }>(`/api/store/${name}`);
    if (!Array.isArray(r.value) || JSON.stringify(r.value) === JSON.stringify(latest.get(name))) return;
    latest.set(name, r.value);
    save(`pine.${name}`, r.value);
    broadcast(name, r.value);
  } catch {
    /* offline: keep what we have */
  }
}

/** Save now (e.g. before leaving the page). */
export function flushAll() {
  for (const name of pending.keys()) flush(name);
}

/** A saved list (resources, lessons, feedback…). Seeds the first time; saves ~0.8s after changes. */
export function useCollection<T extends { id: string }>(name: string, seed: T[]) {
  const key = `pine.${name}`;
  const [items, setItems] = useState<T[]>(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const local = load<T[] | null>(key, null);
      let value = (latest.get(name) as T[] | undefined) ?? local ?? seed;
      const st = await getStatus();
      if (st.db && !latest.has(name)) {
        try {
          const r = await api<{ value: T[] | null }>(`/api/store/${name}`);
          const unsaved = load<{ changed: string[]; deleted: string[] } | null>(PK(name), null);
          if (Array.isArray(r.value) && unsaved && local) {
            // Edits from last time that never reached the database: merge them in and save.
            const p = pend(name);
            unsaved.changed.forEach((id) => p.changed.add(id));
            unsaved.deleted.forEach((id) => p.deleted.add(id));
            value = mergeLists(r.value, local, p.changed, p.deleted);
            latest.set(name, value);
            flush(name);
          } else if (Array.isArray(r.value)) value = r.value;
          else if (local?.length) {
            // First time online: upload what this browser already has.
            pend(name);
            local.forEach((x) => pending.get(name)!.changed.add(x.id));
            latest.set(name, local);
            flush(name);
          }
        } catch {
          /* keep the local copy */
        }
      }
      if (!live) return;
      if (!latest.has(name)) latest.set(name, value);
      setItems((latest.get(name) as T[]) ?? value);
      setReady(true);
    })();
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail as { name: string; value: T[] };
      if (d?.name === name) setItems(d.value);
    };
    const onFocus = () => {
      if (document.visibilityState === "visible") pull(name);
    };
    window.addEventListener("pine:sync", onSync);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("pagehide", flushAll);
    return () => {
      live = false;
      window.removeEventListener("pine:sync", onSync);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("pagehide", flushAll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const update = useCallback(
    (fn: (cur: T[]) => T[]) => {
      const cur = ((latest.get(name) as T[] | undefined) ?? items) as T[];
      const next = fn(cur);
      const d = diffIds(cur, next);
      const p = pend(name);
      d.changed.forEach((id) => { p.changed.add(id); p.deleted.delete(id); });
      d.deleted.forEach((id) => { p.deleted.add(id); p.changed.delete(id); });
      // Order changes (drag-reorder) count as a change to every item so the new order is saved.
      if (!d.changed.length && !d.deleted.length && cur.map((x) => x.id).join() !== next.map((x) => x.id).join()) next.forEach((x) => p.changed.add(x.id));
      latest.set(name, next);
      save(key, next);
      rememberPending(name);
      setItems(next);
      broadcast(name, next);
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => flush(name), 800));
    },
    [key, name, items],
  );

  return { items, update, ready };
}

/** Shrink a photo she drops in (keeps storage small): JPEG, max 1600px. */
export function shrinkImage(file: File, max = 1600): Promise<string> {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement("canvas");
      c.width = Math.round(im.width * s);
      c.height = Math.round(im.height * s);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    im.onerror = () => fail(new Error(`Couldn't read ${file.name}`));
    im.src = url;
  });
}

export const readAsBase64 = (file: File): Promise<string> =>
  new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => fail(new Error(`Couldn't read ${file.name}`));
    r.readAsDataURL(file);
  });

/** Route museum images through our proxy so they can be embedded in .pptx files. */
export const proxied = (url: string) => (url.startsWith("data:") || url.startsWith("/") ? url : `/api/img?url=${encodeURIComponent(url)}`);
