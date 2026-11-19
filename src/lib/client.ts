"use client";
// Browser helpers: passcode, status, and collections that save to the shared studio database
// when it's set up, and always keep a copy in this browser.
import { useCallback, useEffect, useRef, useState } from "react";

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

export type Status = { claude: boolean; db: boolean; passcode: boolean; email: boolean };
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

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** A saved list (resources, lessons, feedback…). Seeds the first time; saves ~0.8s after changes. */
export function useCollection<T>(name: string, seed: T[]) {
  const key = `pine.${name}`;
  const [items, setItems] = useState<T[]>(seed);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const local = load<T[] | null>(key, null);
      let value = local ?? seed;
      const st = await getStatus();
      if (st.db) {
        try {
          const r = await api<{ value: T[] | null }>(`/api/store/${name}`);
          if (Array.isArray(r.value)) value = r.value;
        } catch {
          /* keep the local copy */
        }
      }
      if (!live) return;
      loaded.current = true;
      setItems(value);
      setReady(true);
    })();
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail as { name: string; value: T[] };
      if (d?.name === name) setItems(d.value);
    };
    window.addEventListener("pine:sync", onSync);
    return () => {
      live = false;
      window.removeEventListener("pine:sync", onSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const update = useCallback(
    (fn: (cur: T[]) => T[]) => {
      setItems((cur) => {
        const next = fn(cur);
        save(key, next);
        clearTimeout(timers.get(name));
        timers.set(
          name,
          setTimeout(async () => {
            if ((await getStatus()).db) api(`/api/store/${name}`, { method: "PUT", body: JSON.stringify(next) }).catch(() => {});
          }, 800),
        );
        // Let other open components using the same collection see the change.
        queueMicrotask(() => window.dispatchEvent(new CustomEvent("pine:sync", { detail: { name, value: next } })));
        return next;
      });
    },
    [key, name],
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
