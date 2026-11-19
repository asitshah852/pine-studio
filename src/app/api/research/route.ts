import { denied, passcodeOk } from "@/lib/auth";
import { research } from "@/lib/prompts";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const { topic, angle } = (await req.json()) as { topic?: string; angle?: string };
  if (!topic?.trim()) return Response.json({ error: "Type a topic first." }, { status: 400 });
  try {
    return Response.json(await research(topic.trim(), (angle ?? "").trim()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
