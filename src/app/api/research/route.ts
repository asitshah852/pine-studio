import { denied, passcodeOk } from "@/lib/auth";
import { research } from "@/lib/prompts";
import { keep } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const { topic, premise, course, jobKey, minutes } = (await req.json()) as { topic?: string; premise?: string; course?: string; jobKey?: string; minutes?: number };
  if (!topic?.trim()) return Response.json({ error: "Type a topic first." }, { status: 400 });
  try {
    return Response.json(await keep(jobKey, null, () => research(topic.trim(), (premise ?? "").trim(), (course ?? "").trim(), Number(minutes) || undefined)));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
