// Exhibit search across sources (used by the Exhibits panel and the chat).
import { searchAIC, searchCleveland, searchMet } from "./museum";
import { searchLOC, searchYouTube, videoFromLink, videoId } from "./sources";
import type { Artwork } from "./types";

export type Src = "museums" | "loc" | "youtube" | "all";

export async function searchSources(q: string, src: Src) {
  const jobs: [string, () => Promise<Artwork[]>][] = [];
  if (src === "museums" || src === "all") jobs.push(["Art Institute of Chicago", () => searchAIC(q)], ["The Met", () => searchMet(q)], ["Cleveland Museum of Art", () => searchCleveland(q)]);
  if (src === "loc" || src === "all") jobs.push(["Library of Congress", () => searchLOC(q, 10)]);
  // A pasted YouTube link works for any source choice and needs no key.
  if (videoId(q)) return videoFromLink(q).then((v) => ({ results: [v], errors: [] as string[] })).catch((e: Error) => ({ results: [] as Artwork[], errors: [`YouTube: ${e.message}`] }));
  if (src === "youtube") jobs.push(["YouTube", () => searchYouTube(q, 10).catch((e: Error) => { throw new Error(/switched on/.test(e.message) ? "searching YouTube needs the YouTube key in Vercel — or paste the video's link here instead" : e.message); })]);
  const settled = await Promise.allSettled(jobs.map(([, f]) => f()));
  const errors = settled.flatMap((r, i) => (r.status === "rejected" ? [`${jobs[i][0]}: ${(r.reason as Error)?.message ?? "failed"}`] : []));
  const lists = settled.map((r) => (r.status === "fulfilled" ? r.value : []));
  const results: Artwork[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) results.push(l[i]);
  return { results, errors };
}

