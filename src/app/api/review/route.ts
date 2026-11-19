import { denied, passcodeOk } from "@/lib/auth";
import { review } from "@/lib/prompts";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as Parameters<typeof review>[0] & { jobKey?: string };
  if (!b?.slides?.length && !b?.materials?.length) return Response.json({ error: "Add slides or materials to this class first." }, { status: 400 });
  try {
    return Response.json(await background(b.jobKey, null, () => review({ ...b, slides: (b.slides ?? []).slice(0, 80), materials: (b.materials ?? []).slice(0, 10) })));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
