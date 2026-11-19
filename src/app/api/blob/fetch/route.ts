// "Save a PDF copy": she pastes either the PDF's own link OR the book's web page. If it's a page,
// we look on that page for its PDF download link (e.g. "Download PDF") and follow it. The PDF then
// streams straight into private storage. Only PDFs are stored.
import { put } from "@vercel/blob";
import { denied, passcodeOk } from "@/lib/auth";
import { blobAuth, blobOn } from "@/lib/blob";
import { nextPages, pdfLinks } from "@/lib/pdflinks";

export const maxDuration = 300;
const MAX = 300 * 1024 * 1024;
const UA = { "User-Agent": "PineStudio/0.1 (teaching tool)" };

const isPdf = (r: Response) => {
  const type = r.headers.get("content-type") ?? "";
  const disp = r.headers.get("content-disposition") ?? "";
  return /pdf/i.test(type) || (/octet-stream|binary/i.test(type) && (/\.pdf($|\?)/i.test(r.url) || /\.pdf/i.test(disp)));
};

/** Look on a page (and one step beyond it) for the PDF itself. */
async function findPdf(html: string, base: string, depth = 0): Promise<Response | null> {
  for (const link of pdfLinks(html, base)) {
    const t = await open(link);
    if (t?.ok && isPdf(t)) return t;
    // A "PDF" link that lands on another page (e.g. the publisher's): look there too.
    if (t?.ok && depth === 0 && /html/i.test(t.headers.get("content-type") ?? "")) {
      const found = await findPdf((await t.text()).slice(0, 3_000_000), t.url, 1);
      if (found) return found;
    } else await t?.body?.cancel().catch(() => {});
  }
  if (depth === 0)
    for (const link of nextPages(html, base)) {
      const t = await open(link);
      if (t?.ok && isPdf(t)) return t;
      if (t?.ok && /html/i.test(t.headers.get("content-type") ?? "")) {
        const found = await findPdf((await t.text()).slice(0, 3_000_000), t.url, 1);
        if (found) return found;
      } else await t?.body?.cancel().catch(() => {});
    }
  return null;
}

async function open(url: string) {
  return fetch(url, { redirect: "follow", headers: { ...UA, Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5" } }).catch(() => null);
}

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  if (!blobOn()) return Response.json({ error: "PDF storage isn't switched on yet (Vercel → Storage → Blob)." }, { status: 503 });
  const { url, name } = (await req.json()) as { url?: string; name?: string };
  let u: URL;
  try {
    u = new URL(String(url).trim());
  } catch {
    return Response.json({ error: "That doesn't look like a web link." }, { status: 400 });
  }
  if (u.protocol !== "https:") return Response.json({ error: "Use an https:// link." }, { status: 400 });

  let r = await open(u.toString());
  if (!r?.ok) return Response.json({ error: `Couldn't open that link (${r ? r.status : "no answer"}).` }, { status: 400 });
  if (!isPdf(r)) {
    // A web page: look for its PDF download link (and one step beyond it).
    const html = (await r.text()).slice(0, 3_000_000);
    const found = await findPdf(html, r.url);
    if (!found) return Response.json({ error: "Couldn't find a PDF on that page. Open the page, find its PDF (often “Download PDF” or “Download”), right-click it, choose “Copy link address”, and paste that instead." }, { status: 400 });
    r = found;
  }
  const size = Number(r.headers.get("content-length") || 0);
  if (size > MAX) return Response.json({ error: "That PDF is over 300 MB." }, { status: 400 });
  const safe = (name || u.pathname.split("/").pop() || "textbook").replace(/[^\w.\- ()]/g, "_").replace(/\.pdf$/i, "").slice(0, 80) + ".pdf";
  try {
    const blob = await put(`textbooks/${safe}`, r.body!, { access: "private", addRandomSuffix: true, contentType: "application/pdf", multipart: true, ...blobAuth() });
    return Response.json({ path: blob.pathname, size, name: safe, from: r.url });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
