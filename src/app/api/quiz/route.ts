import { denied, passcodeOk } from "@/lib/auth";
import { quiz } from "@/lib/prompts";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as Parameters<typeof quiz>[0] & { jobKey?: string };
  if (!b?.research?.length && !b?.slides?.length) return Response.json({ error: "Make the research or slides for this class first." }, { status: 400 });
  try {
    return Response.json(await background(b.jobKey, null, () => quiz({ ...b, research: b.research.slice(0, 80), slides: (b.slides ?? []).slice(0, 80), questions: (b.questions ?? []).slice(0, 12) })));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
