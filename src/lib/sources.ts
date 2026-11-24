// More places to find exhibits:
//  • Library of Congress (loc.gov JSON API, free, no key). Rights are read from each item's own
//    record; only "no known restrictions" counts as free to use, everything else is "rights: check".
//  • YouTube (Data API v3, YOUTUBE_API_KEY). Videos are linked and embedded, never downloaded.
//    Each search uses ~1% of the daily allowance, so it only runs when asked for.
import { isMatch } from "./museum";
import type { Artwork } from "./types";

const UA = { "User-Agent": "PineKitchen/0.1 (teaching tool)" };
const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const first = (v: unknown) => (Array.isArray(v) ? clean(v[0]) : clean(v));
const https = (u: string) => (u.startsWith("//") ? `https:${u}` : u).replace(/#.*$/, "");

/* ── Library of Congress ── */
type LocResult = {
  id?: string;
  url?: string;
  title?: string;
  date?: string;
  contributor?: string[] | string;
  image_url?: string[];
  image?: { full?: string; thumb?: string };
  original_format?: string[];
  medium?: string[] | string;
};

export function parseLoc(results: LocResult[]): (Artwork & { _big: string })[] {
  return results
    .map((r) => {
      const imgs = (r.image_url ?? []).filter((u) => typeof u === "string" && /\.(jpe?g|png|gif)/i.test(u)).map(https);
      const photos = imgs.filter((u) => /\.(jpe?g|png)/i.test(u)); // prefer real photos over tiny .gif previews
      const thumb = photos[0] || imgs[0] || (r.image?.thumb ? https(r.image.thumb) : "");
      const big = photos[photos.length - 1] || (r.image?.full ? https(r.image.full) : "") || thumb;
      const url = https(clean(r.url) || clean(r.id));
      if (!url || !thumb) return null;
      return {
        museum: "Library of Congress" as const,
        id: url.replace(/\/+$/, "").split("/").pop() || url,
        title: clean(r.title) || "Untitled",
        artist: first(r.contributor) || "Unknown",
        date: clean(r.date),
        medium: first(r.medium) || first(r.original_format),
        credit: "",
        url,
        publicDomain: false, // set from the item record below
        thumbUrl: thumb,
        imageUrl: undefined as string | undefined,
        _big: big,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

/** Read an item's rights note; "No known restrictions" → free to use. */
export function rightsFrom(item: Record<string, unknown> | undefined): { free: boolean; note: string } {
  const pick = (k: string) => {
    const v = item?.[k];
    return Array.isArray(v) ? v.map(clean).join(" ") : clean(v);
  };
  const note = pick("rights_advisory") || pick("rights_information") || pick("rights");
  return { free: /no known restrictions/i.test(note), note: note.slice(0, 200) };
}

export async function searchLOC(q: string, limit = 12): Promise<Artwork[]> {
  const r = await fetch(`https://www.loc.gov/photos/?q=${encodeURIComponent(q)}&fo=json&c=${limit}`, { headers: UA, next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`Library of Congress search failed (${r.status})`);
  const j = (await r.json()) as { results?: LocResult[] };
  const hits = parseLoc(j.results ?? []).slice(0, limit);
  // Check the rights of each result on its own record (a handful of small requests).
  return Promise.all(
    hits.map(async ({ _big, ...a }) => {
      try {
        const ir = await fetch(`${a.url.replace(/\/?$/, "/")}?fo=json`, { headers: UA, next: { revalidate: 604800 } });
        const ij = ir.ok ? ((await ir.json()) as { item?: Record<string, unknown> }) : {};
        const { free, note } = rightsFrom(ij.item);
        return { ...a, publicDomain: free, imageUrl: free ? _big : undefined, credit: note };
      } catch {
        return { ...a, credit: "Rights not confirmed: see the item page" };
      }
    }),
  );
}

/* ── YouTube ── */
export const youtubeOn = () => Boolean(process.env.YOUTUBE_API_KEY);

type YTItem = { id: { videoId?: string }; snippet: { title: string; channelTitle: string; publishedAt: string; description?: string } };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function parseYouTube(items: YTItem[]): Artwork[] {
  return items
    .filter((i) => i.id?.videoId)
    .map((i) => {
      const id = i.id.videoId!;
      const channel = decode(i.snippet.channelTitle);
      return {
        museum: "YouTube" as const,
        id,
        title: decode(i.snippet.title),
        artist: channel,
        date: (i.snippet.publishedAt || "").slice(0, 4),
        medium: "Video",
        credit: /vevo$/i.test(channel.replace(/\s/g, "")) ? "Official artist channel (VEVO)" : "Check it's an official channel",
        url: `https://www.youtube.com/watch?v=${id}`,
        publicDomain: false,
        thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        video: { id, channel },
      };
    });
}

export async function searchYouTube(q: string, limit = 8): Promise<Artwork[]> {
  if (!youtubeOn()) throw new Error("YouTube isn't switched on yet (add YOUTUBE_API_KEY in Vercel).");
  const url =
    "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=moderate" +
    `&maxResults=${limit}&q=${encodeURIComponent(q)}&key=${process.env.YOUTUBE_API_KEY}`;
  const r = await fetch(url, { next: { revalidate: 86400 } });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(/quota/i.test(body) ? "YouTube's daily search allowance is used up — try again tomorrow." : `YouTube search failed (${r.status}).`);
  }
  return parseYouTube(((await r.json()) as { items?: YTItem[] }).items ?? []);
}

/** Find the official video for a suggested title (e.g. "Video Killed the Radio Star", "The Buggles"). */
export async function findVideo(title: string, artist: string): Promise<Artwork | undefined> {
  if (!youtubeOn()) return undefined;
  const hits = await searchYouTube(`${artist} ${title} official video`.trim(), 6);
  const rank = (a: Artwork) => (/vevo|official/i.test(a.artist) ? 0 : 1);
  return hits.filter((h) => isMatch({ ...h, artist: `${h.artist} ${h.title}` }, title, artist)).sort((a, b) => rank(a) - rank(b))[0];
}

/* ── A YouTube video from its link (no key needed) ──
   Uses YouTube's public oEmbed service (the official "link preview" endpoint). */
export function videoId(link: string): string | null {
  const m = link.trim().match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/i);
  return m ? m[1] : null;
}

export async function videoFromLink(link: string): Promise<Artwork> {
  const id = videoId(link);
  if (!id) throw new Error("That isn't a YouTube video link.");
  const watch = `https://www.youtube.com/watch?v=${id}`;
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { next: { revalidate: 86400 } });
  if (r.status === 401 || r.status === 403) throw new Error("That video can't be embedded (its owner has turned embedding off). Try another copy, ideally from the official channel.");
  if (!r.ok) throw new Error("Couldn't find that video — it may be private or removed.");
  const j = (await r.json()) as { title?: string; author_name?: string };
  const channel = j.author_name ?? "YouTube";
  return {
    museum: "YouTube",
    id,
    title: j.title ?? "YouTube video",
    artist: channel,
    date: "",
    medium: "Video",
    credit: /vevo$/i.test(channel.replace(/\s/g, "")) ? "Official artist channel (VEVO)" : "Check it's an official channel",
    url: watch,
    publicDomain: false,
    thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    video: { id, channel },
  };
}
