// Stores one uploaded picture or one document's text on its own, so classes stay small.
// Without the shared database the browser keeps the data itself (see lib/files.ts).
import { randomBytes } from "node:crypto";
import { denied, passcodeOk } from "@/lib/auth";
import { db, dbConfigured, K } from "@/lib/db";

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  if (!dbConfigured()) return Response.json({ error: "Shared saving isn't set up." }, { status: 503 });
  const { kind, data } = (await req.json()) as { kind?: "image" | "text"; data?: string };
  if (!data || (kind !== "image" && kind !== "text")) return Response.json({ error: "Nothing to save." }, { status: 400 });
  if (data.length > 4_000_000) return Response.json({ error: "That file is too big." }, { status: 413 });
  const id = randomBytes(12).toString("hex");
  await db().set(K(`file:${id}`), { kind, data });
  return Response.json({ id, url: `/api/file/${id}` });
}
