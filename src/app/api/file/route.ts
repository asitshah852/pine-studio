// Stores one uploaded picture or one document's text on its own, so classes stay small.
// Without the shared database the browser keeps the data itself (see lib/files.ts).
import { randomBytes } from "node:crypto";
import { denied, passcodeOk } from "@/lib/auth";
import { put } from "@vercel/blob";
import { blobAuth, blobOn } from "@/lib/blob";
import { db, dbConfigured, K } from "@/lib/db";

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  if (!dbConfigured()) return Response.json({ error: "Shared saving isn't set up." }, { status: 503 });
  const { kind, data } = (await req.json()) as { kind?: "image" | "text"; data?: string };
  if (!data || (kind !== "image" && kind !== "text")) return Response.json({ error: "Nothing to save." }, { status: 400 });
  if (data.length > 4_000_000) return Response.json({ error: "That file is too big." }, { status: 413 });
  // Pictures go to file storage (Vercel Blob) when it's on: whole decks of pictures would soon fill
  // the small database. If storage isn't on or the upload fails, they go to the database as before.
  if (kind === "image" && blobOn()) {
    try {
      const m = data.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
      if (m) {
        const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : m[1] === "image/gif" ? "gif" : "jpg";
        const b = await put(`images/slide.${ext}`, Buffer.from(m[2], "base64"), { access: "private", addRandomSuffix: true, contentType: m[1], ...blobAuth() });
        return Response.json({ url: `/api/blob/file?path=${encodeURIComponent(b.pathname)}` });
      }
    } catch {
      /* fall back to the database */
    }
  }
  const id = randomBytes(12).toString("hex");
  await db().set(K(`file:${id}`), { kind, data });
  return Response.json({ id, url: `/api/file/${id}` });
}
