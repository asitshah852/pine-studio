// Exhibit search. src = "museums" (AIC, Met, Cleveland), "loc" (Library of Congress),
// "youtube", or "all" (museums + Library of Congress; YouTube only when asked, to save its allowance).
import { searchSources, type Src } from "@/lib/search";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.trim() ?? "";
  const src = (["museums", "loc", "youtube", "all"].includes(u.searchParams.get("src") ?? "") ? u.searchParams.get("src") : "all") as Src;
  if (!q) return Response.json({ results: [], errors: [] });
  return Response.json(await searchSources(q, src));
}
