// Reading pages out of stored document text ("--- Page N ---" blocks). Pure; used in the browser
// and on the server (semester planner reads her textbooks). Tested in tests/core.test.ts.

/** Pick pages from..to out of text stored as "--- Page N ---" blocks. */
export function slicePages(all: string, from: number, to: number): string {
  const parts = all.split(/--- Page (\d+) ---\n/);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    if (n >= from && n <= to) out.push(`[PDF page ${n}]\n${parts[i + 1].trim()}`);
  }
  return out.join("\n\n");
}


const STOP = new Set("about after also because been before being between both could does each from have into made many more most much must only other over same such than that their them then there these they this those through under very were what when where which while with would your class students".split(" "));
// Word stems (first five letters) so "painting" finds "painters" and "photography" finds "photographs".
const keywords = (q: string) => [...new Set(q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.slice(0, 5)))];

/** Score each page of a stored book by how often it mentions the topic's words. Pure — tested. */
export function bestPages(all: string, query: string, max = 4): { page: number; text: string; score: number }[] {
  const words = keywords(query);
  if (!words.length) return [];
  const parts = all.split(/--- Page (\d+) ---\n/);
  const pages: { page: number; text: string; score: number }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const text = parts[i + 1].trim();
    const low = text.toLowerCase();
    let score = 0;
    let hit = 0;
    for (const w of words) {
      const n = low.split(w).length - 1;
      if (n) hit++;
      score += Math.min(n, 4);
    }
    score += hit * 2; // pages that mention several of the words beat pages that repeat one
    if (hit >= 1 && score >= 3 && text.length > 200) pages.push({ page: Number(parts[i]), text, score });
  }
  return pages.sort((a, b) => b.score - a.score).slice(0, max);
}

