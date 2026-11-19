import { denied, passcodeOk } from "@/lib/auth";
import { factCheck, type CheckInput } from "@/lib/prompts";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const body = (await req.json()) as { items?: CheckInput; uploads?: { kind: "image" | "pdf"; data: string }[] };
  const items = (body.items ?? []).filter((i) => i?.text?.trim());
  const uploads = (body.uploads ?? []).slice(0, 8);
  if (!items.length && !uploads.length) return Response.json({ error: "Nothing to check yet." }, { status: 400 });
  try {
    return Response.json({ claims: await factCheck(items, uploads), at: new Date().toISOString() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
