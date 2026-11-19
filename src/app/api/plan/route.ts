import { denied, passcodeOk } from "@/lib/auth";
import { plan } from "@/lib/prompts";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as Parameters<typeof plan>[0] & { jobKey?: string };
  if (!b?.weeks) return Response.json({ error: "How many weeks is the semester?" }, { status: 400 });
  try {
    return Response.json(await background(b.jobKey, null, async () => ({ items: await plan({ ...b, themes: String(b.themes ?? "").slice(0, 3000), existing: (b.existing ?? []).slice(0, 60) }) })));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
