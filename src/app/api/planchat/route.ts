import { denied, passcodeOk } from "@/lib/auth";
import { planChat } from "@/lib/planChat";
import { background } from "@/lib/results";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as Parameters<typeof planChat>[0] & { jobKey?: string };
  if (!b?.message?.trim()) return Response.json({ error: "Type a message first." }, { status: 400 });
  try {
    return Response.json(
      await background(b.jobKey, { message: b.message }, () =>
        planChat({ ...b, weeks: Math.max(1, Math.min(18, Number(b.weeks) || 16)), perWeek: Math.max(1, Math.min(3, Number(b.perWeek) || 2)), existing: (b.existing ?? []).slice(0, 80), items: (b.items ?? []).slice(0, 60), sources: (b.sources ?? []).slice(0, 30), use: b.use ?? [], history: b.history ?? [], message: b.message.trim().slice(0, 4000) }),
      ),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
