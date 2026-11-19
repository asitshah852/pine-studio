// "Save a PDF copy from a link": downloads an openly licensed textbook PDF straight into private
// storage (it streams through, so size isn't limited by this app). Only PDFs are accepted.
import { put } from "@vercel/blob";
import { denied, passcodeOk } from "@/lib/auth";

export const maxDuration = 300;
const MAX = 300 * 1024 * 1024;

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "PDF storage isn't switched on yet (Vercel → Storage → Blob)." }, { status: 503 });
  const { url, name } = (await req.json()) as { url?: string; name?: string };
  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    return Response.json({ error: "That doesn't look like a web link." }, { status: 400 });
  }
  if (u.protocol !== "https:") return Response.json({ error: "Use an https:// link." }, { status: 400 });
  const r = await fetch(u, { redirect: "follow", headers: { "User-Agent": "PineStudio/0.1 (teaching tool)", Accept: "application/pdf" } }).catch(() => null);
  if (!r?.ok || !r.body) return Response.json({ error: `Couldn't download it (${r ? r.status : "no answer"}). Open the link in your browser to check it.` }, { status: 400 });
  const type = r.headers.get("content-type") ?? "";
  if (!/pdf|octet-stream/i.test(type) && !/\.pdf($|\?)/i.test(r.url)) {
    return Response.json({ error: "That link opens a web page, not a PDF. On the book's page, right-click “Download PDF” and copy that link instead." }, { status: 400 });
  }
  const size = Number(r.headers.get("content-length") || 0);
  if (size > MAX) return Response.json({ error: "That PDF is over 300 MB." }, { status: 400 });
  const safe = (name || u.pathname.split("/").pop() || "textbook").replace(/[^\w.\- ()]/g, "_").replace(/\.pdf$/i, "").slice(0, 80) + ".pdf";
  try {
    const blob = await put(`textbooks/${safe}`, r.body, { access: "private", addRandomSuffix: true, contentType: "application/pdf", multipart: true });
    return Response.json({ path: blob.pathname, size, name: safe });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
