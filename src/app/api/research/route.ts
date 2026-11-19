import { denied, passcodeOk } from "@/lib/auth";
import { research } from "@/lib/prompts";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const { topic, premise, course } = (await req.json()) as { topic?: string; premise?: string; course?: string };
  if (!topic?.trim()) return Response.json({ error: "Type a topic first." }, { status: 400 });
  try {
    return Response.json(await research(topic.trim(), (premise ?? "").trim(), (course ?? "").trim()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
