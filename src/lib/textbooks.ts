"use client";
// Her own textbook PDFs: upload to private storage, keep the text for Prep's Textbook tool.
import { upload } from "@vercel/blob/client";
import { api, getPass } from "./client";
import { loadText, saveText } from "./files";

export async function uploadTextbook(file: File, onProgress: (s: string) => void) {
  const safe = file.name.replace(/[^\w.\- ()]/g, "_").replace(/\.pdf$/i, "") + ".pdf";
  onProgress("Uploading… 0%");
  const blob = await upload(`textbooks/${safe}`, file, {
    access: "private",
    handleUploadUrl: "/api/blob/upload",
    headers: { "x-pine-passcode": getPass() },
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: (p) => onProgress(`Uploading… ${Math.round(p.percentage)}%`),
  });
  onProgress("Reading the pages…");
  let pages: number | undefined;
  let textId: string | undefined;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    pages = totalPages;
    textId = await saveText(text.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n"));
  } catch {
    /* a scanned PDF with no text layer: the file is still stored */
  }
  return { path: blob.pathname, name: file.name, size: file.size, pages, textId };
}

/** Read a stored PDF's pages and keep the text (for Prep's Textbook tool). */
async function readStored(path: string): Promise<{ pages?: number; textId?: string }> {
  try {
    const r = await fetch(pdfUrl(path));
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    return { pages: totalPages, textId: await saveText(text.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n")) };
  } catch {
    return {};
  }
}

/** Save an openly licensed PDF from a download link. */
export async function saveFromLink(url: string, name: string, onProgress: (s: string) => void) {
  onProgress("Downloading the PDF…");
  const r = await api<{ path: string; size: number; name: string }>("/api/blob/fetch", { method: "POST", body: JSON.stringify({ url, name }) });
  onProgress("Reading the pages…");
  return { path: r.path, name: r.name, size: r.size, ...(await readStored(r.path)) };
}

export const pdfUrl = (path: string) => `/api/blob/file?path=${encodeURIComponent(path)}`;

/** The text of PDF pages from..to (1-based), from her stored copy. */
export async function pagesText(textId: string, from: number, to: number): Promise<string> {
  return slicePages(await loadText(textId), from, to);
}

/** Pick pages from..to out of text stored as "--- Page N ---" blocks. */
export function slicePages(all: string, from: number, to: number): string {
  const parts = all.split(/--- Page (\d+) ---\n/);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    if (n >= from && n <= to) out.push(`[PDF page ${n}]\n${parts[i + 1].trim()}`);
  }
  return out.join("\n\n");
}

// ── Her stored textbooks as a research source ─────────────────────────────────
export type Excerpt = { book: string; path: string; page: number; text: string };

const STOP = new Set("about after also because been before being between both could does each from have into made many more most much must only other over same such than that their them then there these they this those through under very were what when where which while with would your class students".split(" "));
// Word stems (first five letters) so "painting" finds "painters" and "photography" finds "photographs".
const keywords = (q: string) => [...new Set(q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)))];

/** Score each page of a stored book by how often it mentions the topic's words. Pure — tested. */
export function bestPages(all: string, query: string, max = 4): { page: number; text: string; score: number }[] {
  const words = keywords(query);
  if (!words.length) return [];
  const parts = all.split(/--- Page (\d+) ---\n/);
  const pages: { page: number; text: string; score: number }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1].trim();
    const low = text.toLowerCase();
    let score = 0;
    let hit = 0;
    for (const w of words) {
      const n = low.split(w).length - 1;
      if (n) hit++;
      score += Math.min(n, 4);
    }
    score += hit * 2; // pages that mention several of the words beat pages that repeat one
    if (hit >= 1 && score >= 3 && text.length > 200) pages.push({ page: Number(parts[i]), text, score });
  }
  return pages.sort((a, b) => b.score - a.score).slice(0, max);
}

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
