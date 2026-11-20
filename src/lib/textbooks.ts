"use client";
// Her own textbook PDFs: upload to private storage, keep the text for Prep's Textbook tool.
import { upload, uploadPresigned } from "@vercel/blob/client";
import { apiJob, getPass, getStatus } from "./client";
import { loadText } from "./files";
import { bestPages, slicePages } from "./pages";
export { bestPages, slicePages };

export async function uploadTextbook(file: File, onProgress: (s: string) => void, resourceId = "") {
  const safe = file.name.replace(/[^\w.\- ()]/g, "_").replace(/\.pdf$/i, "") + ".pdf";
  onProgress("uploading… 0% (keep this tab open until 100%)");
  const send = (await getStatus()).pdfUploadMode === "presigned" ? uploadPresigned : upload;
  const blob = await send(`textbooks/${safe}`, file, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    headers: { "x-pine-passcode": getPass() },
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (p) => onProgress(`uploading… ${Math.round(p.percentage)}% (keep this tab open until 100%)`),
  });
  onProgress("reading the pages (in the background)…");
  return apiJob<{ path: string; name: string; size: number; pages?: number; textId?: string }>("/api/blob/extract", {
    path: blob.pathname,
    name: file.name,
    size: file.size,
    resourceId,
    jobKey: `pdf:${resourceId || blob.pathname.replace(/[^\w-]/g, "").slice(-40)}`,
  });
}

/** Save an openly licensed PDF from a link (or the book's page). The server does it all in the
 *  background — find, download, store, read the text, file it under the book. */
export async function saveFromLink(url: string, name: string, onProgress: (s: string) => void, resourceId = "") {
  onProgress("finding and saving the PDF (in the background)…");
  return apiJob<{ path: string; name: string; size: number; pages?: number; textId?: string }>("/api/blob/fetch", {
    url,
    name,
    resourceId,
    jobKey: `pdf:${resourceId || "link"}`,
  });
}

export const pdfUrl = (path: string) => `/api/blob/file?path=${encodeURIComponent(path)}`;

/** The text of PDF pages from..to (1-based), from her stored copy. */
export async function pagesText(textId: string, from: number, to: number): Promise<string> {
  return slicePages(await loadText(textId), from, to);
}

// ── Her stored textbooks as a research source ─────────────────────────────────
export type Excerpt = { book: string; path: string; page: number; text: string };

/** The most relevant pages across her stored textbooks for a topic (for research). */
export async function textbookExcerpts(query: string, books: { title: string; pdf?: { path: string; textId?: string } }[], max = 8): Promise<Excerpt[]> {
  const stored = books.filter((b) => b.pdf?.textId);
  const found: (Excerpt & { score: number })[] = [];
  for (const b of stored) {
    try {
      const all = await loadText(b.pdf!.textId!);
      for (const p of bestPages(all, query)) found.push({ book: b.title, path: b.pdf!.path, page: p.page, text: p.text.slice(0, 3500), score: p.score });
    } catch {
      /* skip a book we can't read */
    }
  }
  return found
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score: _s, ...e }) => e);
}
