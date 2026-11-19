import { denied, passcodeOk } from "@/lib/auth";
import { research } from "@/lib/prompts";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const { topic, premise, course, jobKey, minutes, excerpts, preferred, clips } = (await req.json()) as { topic?: string; premise?: string; course?: string; jobKey?: string; minutes?: number; excerpts?: { book: string; path: string; page: number; text: string }[]; preferred?: string[]; clips?: { url: string; title: string; text?: string; note?: string }[] };
  const origin = new URL(req.url).origin;
  const pages = (excerpts ?? []).filter((e) => e?.text && /^textbooks\//.test(e.path)).slice(0, 10).map((e) => ({ ...e, text: String(e.text).slice(0, 4000), url: `${origin}/api/blob/file?path=${encodeURIComponent(e.path)}#page=${Number(e.page) || 1}` }));
  if (!topic?.trim()) return Response.json({ error: "Type a topic first." }, { status: 400 });
  try {
    return Response.json(await background(jobKey, null, () => research(topic.trim(), (premise ?? "").trim(), (course ?? "").trim(), Number(minutes) || undefined, pages, (preferred ?? []).filter((h) => /^[\w.-]+$/.test(h)).slice(0, 25), (clips ?? []).filter((c) => /^https?:\/\//.test(c?.url ?? "")).slice(0, 12))));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
