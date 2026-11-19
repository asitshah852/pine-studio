"use client";
// Save a picture or a document's text. Shared database → its own record (/api/file/<id>);
// otherwise kept inline in this browser.
import { api, getStatus } from "./client";

export async function saveImage(dataUrl: string): Promise<string> {
  if (!(await getStatus()).db) return dataUrl;
  const r = await api<{ url: string }>("/api/file", { method: "POST", body: JSON.stringify({ kind: "image", data: dataUrl }) });
  return r.url;
}

export async function saveText(text: string): Promise<string | undefined> {
  if (!(await getStatus()).db) return undefined;
  const r = await api<{ id: string }>("/api/file", { method: "POST", body: JSON.stringify({ kind: "text", data: text.slice(0, 1_500_000) }) });
  return r.id;
}

export async function loadText(fileId?: string, fallback = ""): Promise<string> {
  if (!fileId) return fallback;
  const r = await fetch(`/api/file/${fileId}`);
  return r.ok ? r.text() : fallback;
}
