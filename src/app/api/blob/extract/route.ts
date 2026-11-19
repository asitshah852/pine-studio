// After a PDF is uploaded from her computer: read its text and file it under the book, in the background.
import { get } from "@vercel/blob";
import { denied, passcodeOk } from "@/lib/auth";
import { blobAuth, blobOn } from "@/lib/blob";
import { attachToResource, pdfText, saveTextServer, type StoredPdf } from "@/lib/pdfServer";
import { background } from "@/lib/results";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const b = (await req.json()) as { path?: string; name?: string; size?: number; resourceId?: string; jobKey?: string };
  if (!blobOn() || !b.path || !/^textbooks\//.test(b.path)) return Response.json({ error: "Nothing to read." }, { status: 400 });
  try {
    return Response.json(
      await background(b.jobKey, { resourceId: b.resourceId }, async (): Promise<StoredPdf> => {
        const r = await get(b.path!, { access: "private", ...blobAuth() });
        let pages: number | undefined;
        let textId: string | undefined;
        if (r && r.statusCode === 200) {
          const bytes = new Uint8Array(await new Response(r.stream).arrayBuffer());
          const t = await pdfText(bytes);
          pages = t.pages;
          textId = t.text ? await saveTextServer(t.text) : undefined;
        }
        const pdf: StoredPdf = { path: b.path!, name: b.name || b.path!.split("/").pop()!, size: Number(b.size) || 0, pages, textId };
        if (b.resourceId) await attachToResource(b.resourceId, pdf);
        return pdf;
      }),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
