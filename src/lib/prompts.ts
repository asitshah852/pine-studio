// The three Claude jobs: research a topic, pull points from her textbook, fact-check text.
import { ask, groundSources, normUrl, parseJson } from "./claude";
import { caption, findWork } from "./museum";
import { normBody } from "./slideText";
import type { Artwork, Claim, ExhibitSuggestion, PlanItem, Quiz, QuizQuestion, ResearchDoc, ReviewDoc, Slide, Source, Suggestion, TextbookPoint, Verdict } from "./types";

const rid = () => Math.random().toString(36).slice(2, 10);

export const HOUSE = `You help Tanya, an adjunct professor with an MFA in photography, prepare an undergraduate Art Appreciation class in Chicago.
Rules you never break:
- Never make anything up. Every fact (name, date, place, medium, attribution, quote, number) must come from a page you found with web search in THIS conversation, and you must give that page's exact URL.
- Prefer museum collection pages (Art Institute of Chicago, The Met, MoMA, National Gallery, Tate, Getty, Smithsonian), Smarthistory, the Met's Heilbrunn Timeline, Grove/Oxford Art, Britannica, and university pages. Avoid Wikipedia as a final source when a museum or scholarly page says the same thing.
- If you can't source something, leave it out or mark it unverified. Never fill a gap with a plausible guess.
- Write for 18–20 year-old non-majors: plain, vivid, no jargon without a one-line explanation.`;

export type Excerpt = { book: string; path: string; page: number; text: string; url: string };

export async function research(
  topic: string,
  premise: string,
  course: string,
  minutes?: number,
  pages: Excerpt[] = [],
  preferred: string[] = [],
  clips: { url: string; title: string; text?: string; note?: string }[] = [],
): Promise<ResearchDoc> {
  const trusted = preferred.length ? `\n\nSites in her own Library — prefer these when they cover the topic: ${preferred.join(", ")}.` : "";
  const clipped = clips.length
    ? `\n\nPAGES SHE CLIPPED FOR THIS CLASS (use them where relevant; you may cite them by URL):\n${clips.map((c) => `- ${c.title} — ${c.url}${c.note ? ` — her note: ${c.note}` : ""}${c.text ? `\n  excerpt: ${c.text.slice(0, 1500)}` : ""}`).join("\n")}`
    : "";
  const textbook = pages.length
    ? `\n\nHER COURSE TEXTBOOKS — pages from her own stored copies that match this topic. Use them where relevant (students have these books), alongside the web. To cite one, put { "textbook": N } in that paragraph's sources.\n${pages.map((p, i) => `[textbook ${i + 1}] ${p.book}, PDF page ${p.page}:\n${p.text}`).join("\n\n")}`
    : "";
  const { text, retrieved } = await ask({
    system: HOUSE,
    search: 12,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Write the research document for a class in "${course || "Art Appreciation"}".
Topic: "${topic}".${premise ? `\nHer premise / angle: ${premise}` : ""}${minutes ? `\nThe class is ${minutes} minutes long.` : ""}

The document is 1–2 pages (about 700–1,000 words) that she can teach from and keep: clear sections, plain language, every factual sentence sourced.${textbook}${clipped}${trusted}

Return ONLY a JSON object (in a \`\`\`json block):
{
  "overview": "2–3 sentence framing of the class for students (no facts that need a source)",
  "sections": [ { "heading": "section heading", "paragraphs": [ { "text": "2–4 sentences of sourced fact", "sources": [ { "title": "page title", "url": "exact URL you retrieved" } or { "textbook": N } ] } ] } ],   // 4–6 sections, 1–3 paragraphs each
  "questions": [ "open discussion question" ],   // 4–6, no facts needed
  "exhibits": [ { "type": "artwork | photograph | video", "artist": "artist name (for a video: the artist or channel)", "title": "exact title of the work or video", "date": "date", "why": "one sentence on why it fits this class" } ]   // 6–10 things to show; for art prefer works in the Art Institute of Chicago, The Met or the Cleveland Museum of Art and use the museum's own title; historic photographs can come from the Library of Congress; for music, film or performance topics include official videos (they are looked up on YouTube)
}`,
      },
    ],
  });
  type Raw = {
    overview?: string;
    sections?: { heading?: string; paragraphs?: { text?: string; sources?: { title?: string; url?: string; textbook?: number }[] }[] }[];
    questions?: string[];
    exhibits?: { type?: string; artist?: string; title?: string; date?: string; why?: string }[];
  };
  // Pages she clipped herself count as real sources.
  for (const c of clips) retrieved.set(normUrl(c.url), c.title);
  const raw = parseJson<Raw>(text);
  const sections = (raw.sections ?? [])
    .filter((s) => s?.paragraphs?.length)
    .map((s) => ({
      id: rid(),
      heading: String(s.heading ?? ""),
      paragraphs: (s.paragraphs ?? [])
        .filter((p) => p?.text)
        .map((p) => {
          const web = groundSources(p.sources?.filter((x) => !x?.textbook), retrieved, true);
          // Pages from her own textbooks are real sources too (she can open them at that page).
          const books = (p.sources ?? [])
            .map((x) => (x?.textbook ? pages[Number(x.textbook) - 1] : undefined))
            .filter((x): x is Excerpt => !!x)
            .map((x) => ({ title: `${x.book}, PDF p. ${x.page}`, url: x.url }));
          const sources = [...books, ...web];
          return { id: rid(), text: String(p.text), sources, verified: sources.length > 0 };
        }),
    }));
  // Every suggested work is looked up in the open museum collections; only real records are attached.
  const sugg = (raw.exhibits ?? []).filter((e) => e?.title).slice(0, 10);
  const exhibits: ExhibitSuggestion[] = await Promise.all(
    sugg.map(async (e) => {
      const match = await findWork(String(e.title), String(e.artist ?? ""), String((e as { type?: string }).type ?? "artwork"));
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
  minutes?: number;
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

Structure: a title slide; content slides that follow the document's order; exhibit slides where the works fit; a closing "Discuss" slide with 2–3 of the questions.${input.minutes ? ` The class is ${input.minutes} minutes: include about one short in-class activity slide (slow looking, pair talk, quick sketch, vote) for every 25 minutes, spaced through the deck.` : ""}

Each slide has two kinds of text:
1. "text" — what students SEE on the slide. Text slides: 2–5 short bullets (max 12 words each). Title slide: one short subtitle line. Artwork / compare slides: usually nothing (the work and its caption speak), or one short line.
2. "talking" — what SHE SAYS while the slide is up; never shown on the slide. 2–4 short lines in her spoken voice: a segue in from the previous slide, the context students need, a question to put to the room, how it connects to what comes next. On exhibit slides, what to point out in the work and why it matters (e.g. "Point to the flat, cut-out figures — that's the poster look MTV borrowed"). Don't just repeat the slide text.

Return ONLY JSON: { "slides": [ { "layout": "title | text | artwork | compare", "title": "short slide title", "text": ["line on the slide"], "talking": ["what she says"], "paragraphs": ["paragraph ids the facts came from"], "exhibits": ["exhibit ids shown on this slide"] } ] }
Rules: artwork slides use exactly 1 exhibit, compare slides exactly 2.`,
      },
    ],
  });
  type RawSlide = { layout?: string; title?: string; text?: string[]; talking?: string[]; points?: string[]; paragraphs?: string[]; exhibits?: string[] };
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
      body: normBody((r.text ?? r.points ?? []).filter((x) => typeof x === "string").join("\n"), layout),
      notes: (r.talking ?? []).filter((x) => typeof x === "string").join("\n"),
      v: 2 as const,
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


export type CheckInput = { id?: string; text: string; sources?: { title: string; url: string }[] }[];

export async function factCheck(items: CheckInput, uploads: { kind: "image" | "pdf"; data: string }[] = []): Promise<Claim[]> {
  const body = items
    .map((it, i) => {
      const known = (it.sources ?? []).map((x) => `  - ${x.title} — ${x.url}`).join("\n");
      return `[${it.id ?? `part-${i + 1}`}]\n${it.text}${known ? `\nSources already found for this part (from the class research and museum records):\n${known}` : ""}`;
    })
    .join("\n\n");
  const content: Parameters<typeof ask>[0]["content"] = [];
  for (const u of uploads) {
    if (u.kind === "image") content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: u.data } });
    else content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: u.data } });
  }
  content.push({
    type: "text",
    text: `Fact-check ${uploads.length ? "the attached slides/pages and " : ""}the text below, sensibly — like a careful colleague, not a pedant.

Check only the KEY facts a student could be misled by: names, dates, titles of works, attributions, places, numbers and direct quotes. At most 3 claims per part; pick the ones that matter.
Do NOT list: opinions, interpretations, teaching prompts, discussion questions, general statements, or well-known common knowledge.
Verdicts:
- "supported" when a reputable source substantially agrees (small differences in wording, rounding or date precision are fine). A source already listed for that part counts — you may cite it.
- "contradicted" only when a reliable source clearly says otherwise; in "fix" give just the corrected wording, nothing else.
- "text": quote the claim's words exactly as they appear in the part, so the wording can be swapped in.
- "unverified" only when you genuinely could not find anything either way.
Search the web where needed.

${body || "(no pasted text)"}

Return ONLY JSON: { "claims": [ { "part": "the [id] the claim came from, or 'upload'", "text": "the claim as written", "verdict": "supported | contradicted | unverified", "fix": "if contradicted: ONLY the corrected wording, one short sentence that could replace the claim (no explanation); else empty", "sources": [ { "title": "...", "url": "exact URL you retrieved or that is listed above" } ] } ] }`,
  });
  const { text, retrieved } = await ask({ system: HOUSE, search: 10, effort: "medium", content });
  // Sources the slides already carried were found earlier by real searches, so they count as retrieved.
  for (const it of items) for (const x of it.sources ?? []) retrieved.set(normUrl(x.url), x.title);
  const raw = parseJson<{ claims?: { part?: string; text?: string; verdict?: string; fix?: string; sources?: { title?: string; url?: string }[] }[] }>(text);
  return (raw.claims ?? [])
    .filter((c) => c?.text)
    .map((c) => {
      const sources = groundSources(c.sources, retrieved, true);
      let verdict: Verdict = c.verdict === "supported" || c.verdict === "contradicted" ? c.verdict : "unverified";
      // A verdict with no real source behind it can't stand.
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

/** "Suggest improvements": review a class she has already taught (her slides + materials). */
export async function review(input: {
  course: string;
  number: number;
  topic: string;
  premise: string;
  slides: { id: string; title: string; body: string; notes: string }[];
  materials: { name: string; text: string }[];
}): Promise<ReviewDoc> {
  const deck = input.slides
    .map((s, i) => `[${s.id}] Slide ${i + 1}: ${s.title}\n${s.body}${s.notes ? `\nNotes: ${s.notes}` : ""}`)
    .join("\n\n");
  let budget = 60_000;
  const mats = input.materials
    .map((m) => {
      const t = m.text.slice(0, Math.max(0, budget));
      budget -= t.length;
      return t ? `### ${m.name}\n${t}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const { text, retrieved } = await ask({
    system: `${HOUSE}
Here you are reviewing a class she has ALREADY taught, as a helpful colleague. Respect her material and voice: suggest, don't rewrite everything. Opinions about teaching are fine and are never presented as facts. Any suggestion that states or corrects a FACT must carry a source you retrieved.`,
    search: 8,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Class ${input.number} of ${input.course || "the course"}: "${input.topic}".${input.premise ? ` Premise: ${input.premise}` : ""}

HER SLIDES (ids in brackets):
${deck || "(no slides)"}

HER OTHER MATERIALS:
${mats || "(none)"}

Review it and return ONLY JSON (in a \`\`\`json block):
{
  "summary": "3–4 sentences: what works well and the biggest opportunities (opinion, no facts)",
  "suggestions": [ {
     "kind": "accuracy | content | discussion | exhibit | structure | clarity",
     "slide": "slide id it concerns, or empty",
     "text": "what to change and why, in plain language (1–3 sentences)",
     "change": { "title": "new title or empty", "body": "new text ON the slide (short lines; '- ' for bullets) or empty", "notes": "new talking points — what she says while it's up (segue, context, a question, how it connects) or empty" },   // only when proposing new wording for that slide
     "newSlide": { "title": "...", "body": "text on the slide, one line each", "notes": "talking points" },   // only when proposing an extra slide after that slide
     "sources": [ { "title": "...", "url": "exact URL you retrieved" } ]   // required for accuracy fixes and any new facts
  } ],   // 6–12 suggestions, most useful first; check her facts and flag anything wrong or outdated as "accuracy"
  "questions": [ "new discussion point or question for students" ],   // 4–6
  "exhibits": [ { "type": "artwork | photograph | video", "artist": "...", "title": "exact title", "date": "...", "why": "how it would strengthen this class" } ]   // 3–6; art from the Art Institute of Chicago, The Met, Cleveland; historic photographs from the Library of Congress; official videos from YouTube
}`,
      },
    ],
  });
  type RawS = { kind?: string; slide?: string; text?: string; change?: { title?: string; body?: string; notes?: string }; newSlide?: { title?: string; body?: string; notes?: string }; sources?: { title?: string; url?: string }[] };
  const raw = parseJson<{ summary?: string; suggestions?: RawS[]; questions?: string[]; exhibits?: { artist?: string; title?: string; date?: string; why?: string }[] }>(text);
  const kinds = ["accuracy", "content", "discussion", "exhibit", "structure", "clarity"] as const;
  const ids = new Set(input.slides.map((s) => s.id));
  const clean = (o?: { title?: string; body?: string; notes?: string }) => {
    if (!o) return undefined;
    const r = { title: o.title?.trim() || undefined, body: o.body?.trim() || undefined, notes: o.notes?.trim() || undefined };
    return r.title || r.body || r.notes ? r : undefined;
  };
  const suggestions: Suggestion[] = (raw.suggestions ?? [])
    .filter((x) => x?.text)
    .map((x) => {
      const sources = groundSources(x.sources, retrieved);
      const kind = (kinds as readonly string[]).includes(x.kind ?? "") ? (x.kind as Suggestion["kind"]) : "content";
      const ns = clean(x.newSlide);
      return {
        id: rid(),
        kind,
        slideId: x.slide && ids.has(x.slide) ? x.slide : undefined,
        text: String(x.text),
        change: clean(x.change),
        newSlide: ns ? { title: ns.title ?? "", body: ns.body ?? "", notes: ns.notes ?? "" } : undefined,
        sources,
        // A fact correction with no retrieved source can't be trusted.
        verified: kind === "accuracy" ? sources.length > 0 : true,
        status: "open" as const,
      };
    });
  const exhibits: ExhibitSuggestion[] = await Promise.all(
    (raw.exhibits ?? []).filter((e) => e?.title).slice(0, 6).map(async (e) => {
      const match = await findWork(String(e.title), String(e.artist ?? ""), String((e as { type?: string }).type ?? "artwork"));
      return { id: rid(), suggested: `${e.artist ? `${e.artist}, ` : ""}${e.title}${e.date ? ` (${e.date})` : ""}`, why: String(e.why ?? ""), match, use: false };
    }),
  );
  return {
    at: new Date().toISOString(),
    summary: String(raw.summary ?? ""),
    suggestions,
    questions: (raw.questions ?? []).filter((q) => typeof q === "string").slice(0, 8),
    exhibits,
  };
}


/** Quiz / exit ticket: ONLY from what this class already says (its research and slides), so every
 *  answer is something she taught. No web search; each question names where its answer comes from. */
export async function quiz(input: {
  course: string;
  number: number;
  topic: string;
  premise: string;
  research: { heading: string; text: string }[];
  questions: string[];
  slides: { title: string; body: string; caption?: string }[];
  count?: number;
}): Promise<Quiz> {
  const n = Math.max(3, Math.min(10, input.count ?? 5));
  const doc = input.research.map((p, i) => `[R${i + 1}] (${p.heading}) ${p.text}`).join("\n").slice(0, 50_000);
  const deck = input.slides.map((s, i) => `[S${i + 1}] ${s.title}${s.caption ? ` — ${s.caption}` : ""}\n${s.body}`).join("\n\n").slice(0, 30_000);
  const { text } = await ask({
    system: `You write short quizzes for Tanya's undergraduate Art Appreciation class.
Rules you never break:
- Use ONLY facts stated in the class material below (research paragraphs [R..] and slides [S..]). Never add a fact, date, name or attribution that is not written there.
- Every question's "from" names the paragraph or slide its answer comes from, e.g. "R3" or "S5".
- Plain, friendly language for first- and second-year students. Test understanding and looking, not trivia.
- Multiple-choice wrong options must be clearly wrong to someone who attended, but plausible; never trick questions.`,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Class ${input.number} of ${input.course || "the course"}: "${input.topic}".${input.premise ? ` Premise: ${input.premise}` : ""}

RESEARCH:
${doc || "(none)"}

SLIDES:
${deck || "(none)"}

DISCUSSION QUESTIONS SHE PLANNED:
${input.questions.join("\n") || "(none)"}

Write a ${n}-question quiz (about two-thirds multiple choice with 4 options, the rest short answer) and 2 exit-ticket prompts (one-minute reflections, opinion welcome, no single right answer).
Return ONLY JSON (in a \`\`\`json block):
{ "questions": [ { "kind": "choice | short", "q": "...", "options": ["A", "B", "C", "D"], "answer": "the correct option's exact text, or a model answer in one or two sentences", "from": "R2" } ],
  "exit": ["...", "..."] }`,
      },
    ],
  });
  const out = parseJson<{ questions?: Partial<QuizQuestion>[]; exit?: string[] }>(text);
  const max = input.research.length;
  const smax = input.slides.length;
  const valid = (f: string) => /^(R(\d+)|S(\d+))$/.test(f) && (f[0] === "R" ? +f.slice(1) <= max : +f.slice(1) <= smax) && +f.slice(1) >= 1;
  const questions: QuizQuestion[] = (out.questions ?? [])
    .filter((q) => q.q && q.answer)
    .map((q) => {
      const kind: QuizQuestion["kind"] = q.kind === "choice" && Array.isArray(q.options) && q.options.length >= 2 ? "choice" : "short";
      return { id: rid(), kind, q: String(q.q), options: kind === "choice" ? q.options!.map(String).slice(0, 5) : undefined, answer: String(q.answer), from: valid(String(q.from ?? "").trim()) ? String(q.from).trim() : "" };
    })
    // a question whose answer can't be traced to the class material is dropped
    .filter((q) => q.from && (q.kind === "short" || q.options!.includes(q.answer)));
  if (!questions.length) throw new Error("Couldn't write questions from this class's material. Make the research or slides first.");
  return { at: new Date().toISOString(), questions, exit: (out.exit ?? []).map(String).filter(Boolean).slice(0, 3) };
}

/** Semester planner: a sequence of class topics with a one-line premise each. It is a teaching plan
 *  (opinion), so no facts are stated; each class's facts are researched and sourced when it is made. */
export async function plan(input: {
  course: string;
  weeks: number;
  perWeek: number;
  minutes?: number;
  themes: string;
  existing: { number: number; topic: string }[];
}): Promise<PlanItem[]> {
  const weeks = Math.max(1, Math.min(18, input.weeks));
  const per = Math.max(1, Math.min(3, input.perWeek));
  const { text } = await ask({
    system: `You help Tanya, an adjunct professor with an MFA in photography, plan an undergraduate course (Chicago community college students, many new to art).
- Suggest a clear, teachable sequence: each class builds on the last; mix periods, media, cultures and voices; leave room for a review class before a midterm/final if the semester is long enough.
- Topics and premises are teaching ideas, not facts: do NOT state dates, names of specific works, attributions or numbers. Those are researched and sourced later, class by class.
- Premise = her angle in one plain sentence (the question or idea the class explores).`,
    effort: "medium",
    content: [
      {
        type: "text",
        text: `Course: ${input.course || "Art Appreciation"}.
Length: ${weeks} weeks, ${per} class${per > 1 ? "es" : ""} a week${input.minutes ? `, ${input.minutes} minutes each` : ""} = ${weeks * per} classes.
Her themes / must-cover topics / notes: ${input.themes || "(none — use a standard Art Appreciation arc)"}
Classes she already has (keep them, plan around them, don't repeat them):
${input.existing.map((e) => `${e.number}. ${e.topic}`).join("\n") || "(none)"}

Return ONLY JSON (in a \`\`\`json block): { "items": [ { "week": 1, "topic": "short class title", "premise": "one sentence", "theme": "which of her themes it serves, or empty" } ] }
Exactly ${Math.max(1, weeks * per - input.existing.length)} items for the classes she does NOT have yet, in teaching order.`,
      },
    ],
  });
  const out = parseJson<{ items?: Partial<PlanItem>[] }>(text);
  const items = (out.items ?? [])
    .filter((x) => x.topic)
    .map((x) => ({ id: rid(), week: Math.max(1, Math.min(weeks, Number(x.week) || 1)), topic: String(x.topic).slice(0, 120), premise: String(x.premise ?? "").slice(0, 400), theme: x.theme ? String(x.theme).slice(0, 80) : undefined, use: true }));
  if (!items.length) throw new Error("Couldn't make a plan. Try adding a few themes.");
  return items;
}
