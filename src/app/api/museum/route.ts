import { searchAIC, searchCleveland, searchMet } from "@/lib/museum";
import type { Artwork } from "@/lib/types";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ results: [], errors: [] });
  const names = ["Art Institute of Chicago", "The Met", "Cleveland Museum of Art"];
  const settled = await Promise.allSettled([searchAIC(q), searchMet(q), searchCleveland(q)]);
  const errors = settled.flatMap((r, i) => (r.status === "rejected" ? [`${names[i]}: ${(r.reason as Error)?.message ?? "failed"}`] : []));
  const lists = settled.map((r) => (r.status === "fulfilled" ? r.value : []));
  // Interleave, Chicago first.
  const results: Artwork[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) results.push(l[i]);
  return Response.json({ results, errors });
}
