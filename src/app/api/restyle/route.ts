import { denied, passcodeOk } from "@/lib/auth";
import { restyle } from "@/lib/prompts";
import { background } from "@/lib/results";
import type { ResearchDoc } from "@/lib/types";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as { doc?: ResearchDoc; topic?: string; course?: string; jobKey?: string };
  if (!b.doc?.sections?.length) return Response.json({ error: "There's no research document to rewrite." }, { status: 400 });
  try {
    return Response.json(await background(b.jobKey, null, () => restyle(b.doc!, b.topic ?? "", b.course ?? "")));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
