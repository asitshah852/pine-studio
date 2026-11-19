// The three Claude jobs: research a topic, pull points from her textbook, fact-check text.
import { ask, groundSources, parseJson } from "./claude";
import { caption, findWork } from "./museum";
import type { Artwork, Claim, ExhibitSuggestion, ResearchDoc, Slide, Source, TextbookPoint, Verdict } from "./types";

const rid = () => Math.random().toString(36).slice(2, 10);

const HOUSE = `You help Tanya, an adjunct professor with an MFA in photography, prepare an undergraduate Art Appreciation class in Chicago.
Rules you never break:
- Never make anything up. Every fact (name, date, place, medium, attribution, quote, number) must come from a page you found with web search in THIS conversation, and you must give that page's exact URL.
- Prefer museum collection pages (Art Institute of Chicago, The Met, MoMA, National Gallery, Tate, Getty, Smithsonian), Smarthistory, the Met's Heilbrunn Timeline, Grove/Oxford Art, Britannica, and university pages. Avoid Wikipedia as a final source when a museum or scholarly page says the same thing.
- If you can't source something, leave it out or mark it unverified. Never fill a gap with a plausible guess.
- Write for 18–20 year-old non-majors: plain, vivid, no jargon without a one-line explanation.`;

export async function research(topic: string, premise: string, course: string): Promise<ResearchDoc> {
  const { text, retrieved } = await ask({
    system: HOUSE,
    search: 12,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Write the research document for a class in "${course || "Art Appreciation"}".
Topic: "${topic}".${premise ? `\nHer premise / angle: ${premise}` : ""}

The document is 1–2 pages (about 700–1,000 words) that she can teach from and keep: clear sections, plain language, every factual sentence sourced.

Return ONLY a JSON object (in a \`\`\`json block):
{
  "overview": "2–3 sentence framing of the class for students (no facts that need a source)",
  "sections": [ { "heading": "section heading", "paragraphs": [ { "text": "2–4 sentences of sourced fact", "sources": [ { "title": "page title", "url": "exact URL you retrieved" } ] } ] } ],   // 4–6 sections, 1–3 paragraphs each
  "questions": [ "open discussion question" ],   // 4–6, no facts needed
  "exhibits": [ { "artist": "artist name", "title": "exact title of the work", "date": "date", "why": "one sentence on why it fits this class" } ]   // 6–10 works to show; strongly prefer works in the Art Institute of Chicago, The Met or the Cleveland Museum of Art collections, and use the museum's own title
}`,
      },
    ],
  });
  type Raw = {
    overview?: string;
    sections?: { heading?: string; paragraphs?: { text?: string; sources?: { title?: string; url?: string }[] }[] }[];
    questions?: string[];
    exhibits?: { artist?: string; title?: string; date?: string; why?: string }[];
  };
  const raw = parseJson<Raw>(text);
  const sections = (raw.sections ?? [])
    .filter((s) => s?.paragraphs?.length)
    .map((s) => ({
      id: rid(),
      heading: String(s.heading ?? ""),
      paragraphs: (s.paragraphs ?? [])
        .filter((p) => p?.text)
        .map((p) => {
          const sources = groundSources(p.sources, retrieved);
          return { id: rid(), text: String(p.text), sources, verified: sources.length > 0 };
        }),
    }));
  // Every suggested work is looked up in the open museum collections; only real records are attached.
  const sugg = (raw.exhibits ?? []).filter((e) => e?.title).slice(0, 10);
  const exhibits: ExhibitSuggestion[] = await Promise.all(
    sugg.map(async (e) => {
      const match = await findWork(String(e.title), String(e.artist ?? ""));
      return {
        id: rid(),
        suggested: `${e.artist ? `${e.artist}, ` : ""}${e.title}${e.date ? ` (${e.date})` : ""}`,
        why: String(e.why ?? ""),
        match,
        use: Boolean(match),
      };
    }),
  );
  return {
    at: new Date().toISOString(),
    overview: String(raw.overview ?? ""),
    sections,
    questions: (raw.questions ?? []).filter((q) => typeof q === "string").slice(0, 8),
    exhibits,
  };
}

/** Turn the research document into slides. Claude may only use facts from the document. */
export async function makeSlides(input: {
  course: string;
  number: number;
  topic: string;
  premise: string;
  doc: ResearchDoc;
  count: number;
}): Promise<Slide[]> {
  const paras = input.doc.sections.flatMap((s) => s.paragraphs.map((p) => ({ ...p, heading: s.heading })));
  const works = input.doc.exhibits.filter((e) => e.use && e.match);
  const docText = input.doc.sections
    .map((s) => `## ${s.heading}\n${s.paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n")}`)
    .join("\n\n");
  const workText = works.map((e) => `[${e.id}] ${caption(e.match!)} — fits because: ${e.why}`).join("\n");
  const { text } = await ask({
    system: `${HOUSE}\nHere you are turning a research document into a slide deck. Use ONLY facts that are in the document or in the exhibit captions. Do not add any new fact, date or name.`,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Make a slide deck of about ${input.count} slides for Class ${input.number} of ${input.course || "the course"}: "${input.topic}".${input.premise ? ` Premise: ${input.premise}` : ""}

RESEARCH DOCUMENT (paragraph ids in brackets):
${docText}

EXHIBITS SHE CHOSE (ids in brackets) — use each one on a relevant slide; two can share a "compare" slide:
${workText || "(none)"}

DISCUSSION QUESTIONS: ${input.doc.questions.join(" | ")}

Structure: a title slide; content slides that follow the document's order; exhibit slides where the works fit; a closing "Discuss" slide with 2–3 of the questions.

Return ONLY JSON: { "slides": [ { "layout": "title | text | artwork | compare", "title": "short slide title", "points": ["brief talking point shown on the slide, max 12 words"], "notes": "speaker notes in simple, spoken language, 50–110 words", "paragraphs": ["paragraph ids the facts came from"], "exhibits": ["exhibit ids shown on this slide"] } ] }
Rules: 0–4 points per slide (none on title slides); artwork slides use exactly 1 exhibit, compare slides exactly 2.`,
      },
    ],
  });
  type RawSlide = { layout?: string; title?: string; points?: string[]; notes?: string; paragraphs?: string[]; exhibits?: string[] };
  const raw = parseJson<{ slides?: RawSlide[] }>(text);
  const byPara = new Map(paras.map((p) => [p.id, p]));
  const byWork = new Map(works.map((w) => [w.id, w.match!]));
  const layouts = ["title", "text", "artwork", "compare"] as const;
  return (raw.slides ?? []).map((r) => {
    const arts: Artwork[] = (r.exhibits ?? []).map((id) => byWork.get(id)).filter((a): a is Artwork => !!a);
    const sources: Source[] = [];
    const seen = new Set<string>();
    for (const pid of r.paragraphs ?? []) for (const s of byPara.get(pid)?.sources ?? []) if (!seen.has(s.url) && seen.add(s.url)) sources.push(s);
    for (const a of arts) if (!seen.has(a.url) && seen.add(a.url)) sources.push({ title: `${a.museum}: ${a.title}`, url: a.url });
    let layout = (layouts as readonly string[]).includes(r.layout ?? "") ? (r.layout as Slide["layout"]) : "text";
    if (layout === "compare" && arts.length < 2) layout = arts.length ? "artwork" : "text";
    if (layout === "artwork" && !arts.length) layout = "text";
    if ((layout === "text" || layout === "title") && arts.length && layout !== "title") layout = arts.length > 1 ? "compare" : "artwork";
    return {
      id: rid(),
      layout,
      title: String(r.title ?? ""),
      body: (r.points ?? []).filter((x) => typeof x === "string").join("\n"),
      notes: String(r.notes ?? ""),
      images: arts
        .map((a) =>
          a.imageUrl
            ? { url: a.imageUrl, credit: caption(a), rights: "public-domain" as const }
            : a.thumbUrl
              ? { url: a.thumbUrl.replace("/full/400,/", "/full/843,/"), credit: caption(a), rights: "check" as const }
              : null,
        )
        .filter((x): x is NonNullable<typeof x> => !!x),
      artworks: arts,
      sources,
    };
  });
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
