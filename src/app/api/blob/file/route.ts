// Opens a stored textbook PDF (private storage; the path has a random part nobody can guess).
// DELETE removes it when the resource is removed.
import { del, get } from "@vercel/blob";
import { denied, passcodeOk } from "@/lib/auth";
import { blobAuth, blobOn } from "@/lib/blob";

const ok = (p: string | null): p is string => !!p && /^textbooks\/[\w.\- ()]+\.pdf$/i.test(p);

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path");
  if (!ok(path) || !blobOn()) return new Response("not found", { status: 404 });
  const r = await get(path, { access: "private", ...blobAuth() });
  if (!r || r.statusCode !== 200) return new Response("not found", { status: 404 });
  const name = path.split("/").pop()!;
  return new Response(r.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(req: Request) {
  if (!passcodeOk(req)) return denied();
  const path = new URL(req.url).searchParams.get("path");
  if (!ok(path) || !blobOn()) return Response.json({ ok: false });
  await del(path, blobAuth()).catch(() => {});
  return Response.json({ ok: true });
}
