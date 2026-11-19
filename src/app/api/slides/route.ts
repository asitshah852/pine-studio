import { denied, passcodeOk } from "@/lib/auth";
import { makeSlides } from "@/lib/prompts";
import type { ResearchDoc } from "@/lib/types";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as { course?: string; number?: number; topic?: string; premise?: string; doc?: ResearchDoc; count?: number };
  if (!b.doc?.sections?.length) return Response.json({ error: "Do the research first." }, { status: 400 });
  try {
    const slides = await makeSlides({
      course: b.course ?? "",
      number: Number(b.number) || 1,
      topic: b.topic ?? "",
      premise: b.premise ?? "",
      doc: b.doc,
      count: Math.min(25, Math.max(5, Number(b.count) || 12)),
    });
    return Response.json({ slides });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
