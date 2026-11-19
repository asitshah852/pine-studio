import { COLLECTIONS, db, dbConfigured, K } from "@/lib/db";
import { denied, passcodeOk } from "@/lib/auth";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ name: string }> };
const ok = (n: string) => (COLLECTIONS as readonly string[]).includes(n);

export async function GET(req: Request, { params }: Ctx) {
  const { name } = await params;
  if (!ok(name)) return Response.json({ error: "Unknown collection" }, { status: 404 });
  if (!dbConfigured()) return Response.json({ shared: false, value: null });
  if (!passcodeOk(req)) return denied();
  return Response.json({ shared: true, value: (await db().get(K(name))) ?? null });
}

export async function PUT(req: Request, { params }: Ctx) {
  const { name } = await params;
  if (!ok(name)) return Response.json({ error: "Unknown collection" }, { status: 404 });
  if (!passcodeOk(req)) return denied();
  if (!dbConfigured()) return Response.json({ shared: false });
  const text = await req.text();
  if (text.length > 4_000_000) return Response.json({ error: "Too big to save in one go." }, { status: 413 });
  // Daily backup: the first save each day keeps a copy of what was there before (30 days).
  const day = new Date().toISOString().slice(0, 10);
  const backup = K(`backup:${name}:${day}`);
  if (!(await db().exists(backup))) {
    const old = await db().get(K(name));
    if (old) await db().set(backup, old, { ex: 30 * 86400, nx: true });
  }
  await db().set(K(name), JSON.parse(text));
  return Response.json({ shared: true });
}
