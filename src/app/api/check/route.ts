import { denied, passcodeOk } from "@/lib/auth";
import { factCheck, type CheckInput } from "@/lib/prompts";
import { background } from "@/lib/results";
import type { Claim } from "@/lib/types";

export const maxDuration = 300;
const BATCH = 4; // slides per fact-check request: small batches get enough web searches per claim

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const body = (await req.json()) as { items?: CheckInput; uploads?: { kind: "image" | "pdf"; data: string }[]; jobKey?: string };
  const items = (body.items ?? []).filter((i) => i?.text?.trim());
  const uploads = (body.uploads ?? []).slice(0, 8);
  if (!items.length && !uploads.length) return Response.json({ error: "Nothing to check yet." }, { status: 400 });
  try {
    return Response.json(
      await background(body.jobKey, { ids: items.map((i) => i.id) }, async () => {
        const at = new Date().toISOString();
        if (uploads.length || items.length <= BATCH) return { claims: await factCheck(items, uploads), at, checked: items.map((i) => i.id) };
        const batches: CheckInput[] = [];
        for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
        const done = await Promise.allSettled(batches.map((b) => factCheck(b)));
        const claims: Claim[] = [];
        const checked: (string | undefined)[] = [];
        done.forEach((r, i) => {
          if (r.status === "fulfilled") {
            claims.push(...r.value);
            checked.push(...batches[i].map((x) => x.id));
          }
        });
        if (!checked.length) throw (done.find((r) => r.status === "rejected") as PromiseRejectedResult).reason;
        // Slides in a batch that failed simply stay "not checked" and are retried next time.
        return { claims, at, checked };
      }),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
