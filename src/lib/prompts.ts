// The three Claude jobs: research a topic, pull points from her textbook, fact-check text.
import { ask, groundSources, parseJson } from "./claude";
import type { Claim, Research, TextbookPoint, Verdict } from "./types";

const HOUSE = `You help Tanya, an adjunct professor with an MFA in photography, prepare an undergraduate Art Appreciation class in Chicago.
Rules you never break:
- Never make anything up. Every fact (name, date, place, medium, attribution, quote, number) must come from a page you found with web search in THIS conversation, and you must give that page's exact URL.
- Prefer museum collection pages (Art Institute of Chicago, The Met, MoMA, National Gallery, Tate, Getty, Smithsonian), Smarthistory, the Met's Heilbrunn Timeline, Grove/Oxford Art, Britannica, and university pages. Avoid Wikipedia as a final source when a museum or scholarly page says the same thing.
- If you can't source something, leave it out or mark it unverified. Never fill a gap with a plausible guess.
- Write for 18–20 year-old non-majors: plain, vivid, no jargon without a one-line explanation.`;

export async function research(topic: string, angle: string): Promise<Research> {
  const { text, retrieved } = await ask({
    system: HOUSE,
    search: 8,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Research this class topic: "${topic}".${angle ? ` Her angle / notes: ${angle}` : ""}

Return ONLY a JSON object (in a \`\`\`json block) with:
{
  "overview": "2–3 sentence plain-English framing of the topic for students (no facts that need a source)",
  "points": [ { "heading": "short label", "text": "1–3 sentences of sourced fact", "sources": [ { "title": "page title", "url": "exact URL you retrieved" } ] } ],   // 6–10 points
  "artworks": [ "Artist, Title (date)" ],   // 4–8 key works to show; prefer works in Chicago collections (Art Institute of Chicago, MCA, Smart Museum) when they fit
  "questions": [ "open discussion question" ]   // 3–5, no facts needed
}`,
      },
    ],
  });
  const raw = parseJson<{ overview?: string; points?: { heading?: string; text?: string; sources?: { title?: string; url?: string }[] }[]; artworks?: string[]; questions?: string[] }>(text);
  return {
    topic,
    at: new Date().toISOString(),
    overview: String(raw.overview ?? ""),
    points: (raw.points ?? [])
      .filter((p) => p?.text)
      .map((p) => {
        const sources = groundSources(p.sources, retrieved);
        return { heading: String(p.heading ?? ""), text: String(p.text), sources, verified: sources.length > 0 };
      }),
    artworks: (raw.artworks ?? []).filter((s) => typeof s === "string").slice(0, 10),
    questions: (raw.questions ?? []).filter((s) => typeof s === "string").slice(0, 6),
  };
}

export async function fromTextbook(input: { pdf?: string; text?: string; book: string; ask: string }): Promise<TextbookPoint[]> {
  if (!input.pdf && !input.text) throw new Error("Add textbook pages (PDF) or paste the text.");
  const doc = input.pdf
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: input.pdf }, title: input.book || "Textbook pages" }
    : { type: "document" as const, source: { type: "text" as const, media_type: "text/plain" as const, data: input.text! }, title: input.book || "Textbook text" };
  const { text } = await ask({
    system: `${HOUSE}\nHere the ONLY allowed source is the textbook pages provided. Do not add anything that is not on these pages.`,
    effort: "low",
    content: [
      doc,
      {
        type: "text",
        text: `From these pages of ${input.book || "the textbook"}, ${input.ask || "pull out the key points for a class slide deck"}.
Return ONLY JSON: { "points": [ { "text": "the point in plain words", "quote": "the exact supporting words copied from the page (max 40 words)", "page": "printed page number if visible, else empty" } ] }  (5–12 points)`,
      },
    ],
  });
  const raw = parseJson<{ points?: TextbookPoint[] }>(text);
  const source = (input.text ?? "").replace(/\s+/g, " ").toLowerCase();
  return (raw.points ?? [])
    .filter((p) => p?.text)
    .map((p) => ({
      text: String(p.text),
      quote: p.quote ? String(p.quote) : undefined,
      page: p.page ? String(p.page) : undefined,
      // For pasted text we can confirm the quote word for word; PDFs are checked by Claude only.
      ...(input.text && p.quote && !source.includes(String(p.quote).replace(/\s+/g, " ").toLowerCase().replace(/[“”]/g, '"'))
        ? { text: `${p.text} [quote not found word-for-word in the pasted text — check]` }
        : {}),
    }));
}

export type CheckInput = { id?: string; text: string }[];

export async function factCheck(items: CheckInput, uploads: { kind: "image" | "pdf"; data: string }[] = []): Promise<Claim[]> {
  const body = items.map((it, i) => `[${it.id ?? `part-${i + 1}`}]\n${it.text}`).join("\n\n");
  const content: Parameters<typeof ask>[0]["content"] = [];
  for (const u of uploads) {
    if (u.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: u.data } });
    else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: u.data } });
  }
  content.push({
    type: "text",
    text: `Fact-check ${uploads.length ? "the attached slides/pages and " : ""}the text below. Find every checkable factual claim (names, dates, attributions, places, media, movements, quotes, numbers). Opinions and discussion questions are not claims. Search the web to check each one.

${body || "(no pasted text)"}

Return ONLY JSON: { "claims": [ { "part": "the [id] the claim came from, or 'upload'", "text": "the claim as written", "verdict": "supported | contradicted | unverified", "fix": "corrected wording if contradicted, else empty", "sources": [ { "title": "...", "url": "exact URL you retrieved" } ] } ] }`,
  });
  const { text, retrieved } = await ask({ system: HOUSE, search: 10, effort: "medium", content });
  const raw = parseJson<{ claims?: { part?: string; text?: string; verdict?: string; fix?: string; sources?: { title?: string; url?: string }[] }[] }>(text);
  return (raw.claims ?? [])
    .filter((c) => c?.text)
    .map((c) => {
      const sources = groundSources(c.sources, retrieved);
      let verdict: Verdict = c.verdict === "supported" || c.verdict === "contradicted" ? c.verdict : "unverified";
      // A verdict with no retrieved source behind it can't stand.
      if (!sources.length) verdict = "unverified";
      const part = String(c.part ?? "").replace(/[[\]]/g, "");
      return {
        text: String(c.text),
        verdict,
        sources,
        fix: verdict === "contradicted" && c.fix ? String(c.fix) : undefined,
        slideId: items.some((it) => it.id === part) ? part : undefined,
      };
    });
}
