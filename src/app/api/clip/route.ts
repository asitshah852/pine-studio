// What is this clipped page? A YouTube video (oEmbed, no key), a museum object page (the museum's own
// API record: AIC, Met, Cleveland), or an ordinary web page (kept as a link/source).
import { fromMuseumLink } from "@/lib/museum";
import { videoFromLink, videoId } from "@/lib/sources";

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!/^https?:\/\//.test(url)) return Response.json({ kind: "page" });
  try {
    if (videoId(url)) return Response.json({ kind: "video", artwork: await videoFromLink(url) });
    const a = await fromMuseumLink(url);
    if (a) return Response.json({ kind: "artwork", artwork: a });
  } catch (e) {
    return Response.json({ kind: "page", note: (e as Error).message });
  }
  return Response.json({ kind: "page" });
}
