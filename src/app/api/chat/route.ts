import { denied, passcodeOk } from "@/lib/auth";
import { chat } from "@/lib/chat";
import { keep } from "@/lib/results";
import type { Lesson } from "@/lib/types";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as { lesson?: Lesson; course?: string; history?: { role: "user" | "assistant"; text: string }[]; message?: string; jobKey?: string };
  if (!b.lesson || !b.message?.trim()) return Response.json({ error: "Type a message first." }, { status: 400 });
  try {
    return Response.json(
      await keep(b.jobKey, { message: b.message }, () => chat({ lesson: b.lesson!, course: b.course ?? "", history: b.history ?? [], message: b.message!.trim() })),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
