import { denied, passcodeOk } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";
import { clearResult, readResult, validKey } from "@/lib/results";

export const dynamic = "force-dynamic";
const k = (req: Request) => new URL(req.url).searchParams.get("key");

export async function GET(req: Request) {
  if (!passcodeOk(req)) return denied();
  const key = k(req);
  if (!validKey(key) || !dbConfigured()) return Response.json({ result: null });
  return Response.json({ result: await readResult(key) });
}

export async function DELETE(req: Request) {
  if (!passcodeOk(req)) return denied();
  const key = k(req);
  if (validKey(key) && dbConfigured()) await clearResult(key);
  return Response.json({ ok: true });
}
