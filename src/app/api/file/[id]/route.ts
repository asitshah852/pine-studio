import { db, dbConfigured, K } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id) || !dbConfigured()) return new Response("not found", { status: 404 });
  const f = await db().get<{ kind: "image" | "text"; data: string }>(K(`file:${id}`));
  if (!f) return new Response("not found", { status: 404 });
  if (f.kind === "text") return new Response(f.data, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const b64 = f.data.replace(/^data:[^,]+,/, "");
  return new Response(Buffer.from(b64, "base64"), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" } });
}
