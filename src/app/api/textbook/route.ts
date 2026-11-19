import { denied, passcodeOk } from "@/lib/auth";
import { fromTextbook } from "@/lib/prompts";

export const maxDuration = 300;
export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const body = (await req.json()) as { pdf?: string; text?: string; book?: string; ask?: string };
  try {
    return Response.json({ points: await fromTextbook({ pdf: body.pdf, text: body.text, book: body.book ?? "", ask: body.ask ?? "" }) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
