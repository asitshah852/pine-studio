// Image proxy for museum images only (lets the browser put them into a .pptx without CORS errors).
import { IMAGE_HOSTS } from "@/lib/museum";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (u.protocol !== "https:" || !IMAGE_HOSTS.includes(u.hostname)) return new Response("host not allowed", { status: 403 });
  const r = await fetch(u, { headers: { "User-Agent": "PineStudio/0.1 (teaching tool)" } });
  if (!r.ok) return new Response("image not found", { status: 502 });
  return new Response(r.body, {
    headers: { "Content-Type": r.headers.get("content-type") ?? "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
