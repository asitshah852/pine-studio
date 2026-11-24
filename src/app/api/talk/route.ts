import { denied, passcodeOk } from "@/lib/auth";
import { talkingPoints } from "@/lib/prompts";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as Parameters<typeof talkingPoints>[0] & { jobKey?: string };
  if (!b?.want?.length || !b.slides?.length) return Response.json({ error: "No slides to write for." }, { status: 400 });
  try {
    return Response.json(await background(b.jobKey, null, async () => ({ slides: await talkingPoints({ ...b, slides: b.slides.slice(0, 80), want: b.want.slice(0, 80), notes: (b.notes ?? []).slice(0, 80) }) })));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
