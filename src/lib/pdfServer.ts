// Server side of textbook PDFs: read a stored PDF's text, keep it, and record the PDF on the book —
// all without the page being open.
import { randomBytes } from "node:crypto";
import { db, dbConfigured, K } from "./db";
import type { Resource } from "./types";

export type StoredPdf = NonNullable<Resource["pdf"]>;

/** Keep a document's text as its own record (same store as /api/file). */
export async function saveTextServer(text: string): Promise<string | undefined> {
  if (!dbConfigured() || !text.trim()) return undefined;
  const id = randomBytes(12).toString("hex");
  await db().set(K(`file:${id}`), { kind: "text", data: text.slice(0, 1_500_000) });
  return id;
}

/** Pages of text from PDF bytes ("--- Page N ---" blocks), or nothing for a scanned book. */
export async function pdfText(bytes: Uint8Array): Promise<{ pages?: number; text?: string }> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const joined = text.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n");
    return { pages: totalPages, text: joined.replace(/--- Page \d+ ---\n\s*/g, "").trim() ? joined : undefined };
  } catch {
    return {};
  }
}

/** Record the stored PDF on the book in the shared Library list (the page also applies it when it next opens). */
export async function attachToResource(resourceId: string, pdf: StoredPdf) {
  if (!dbConfigured() || !resourceId) return;
  const list = await db().get<Resource[]>(K("resources"));
  if (!Array.isArray(list) || !list.some((r) => r.id === resourceId)) return;
  await db().set(K("resources"), list.map((r) => (r.id === resourceId ? { ...r, pdf } : r)));
}
