// Semester planner conversation: Claude follows her instructions for planning a course, carefully
// and completely. It can search the web (e.g. other colleges' course pages), read her stored
// textbooks and uploaded documents, and change the suggested list of classes. Every claim about a
// source must come from something it actually read; textbook chapters and pages only from read_source.
import type Anthropic from "@anthropic-ai/sdk";
import { MODEL, claudeOn, getClient, NoClaude, normUrl } from "./claude";
import { db, dbConfigured, K } from "./db";
import { bestPages, slicePages } from "./pages";
import type { PlanItem, Source } from "./types";

type B = Anthropic.Beta.Messages.BetaToolUnion;
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): B => ({
  name,
  description,
  input_schema: { type: "object", properties, required, additionalProperties: false },
});
const str = { type: "string" };
const int = { type: "integer" };
const srcs = { type: "array", items: { type: "object", properties: { title: str, url: str }, required: ["title", "url"], additionalProperties: false }, description: "pages you actually read (web or read_source citations) that this class is based on; [] if none" };
const cls = {
  type: "object",
  properties: { week: int, topic: str, premise: { ...str, description: "her angle in one plain sentence (no dates or attributions)" }, theme: { ...str, description: "which of her themes it serves, or empty" }, basis: { ...str, description: "what it's based on, e.g. 'Textbook ch. 4 (PDF pp. 81–102)' or 'City Colleges ART 103 outline'; empty if nothing specific" }, sources: srcs },
  required: ["week", "topic", "premise", "theme", "basis", "sources"],
  additionalProperties: false,
};

const TOOLS: B[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 8 },
  tool("read_source", "Read one of her course sources (a stored textbook or a document she uploaded). With no query and no pages it returns the opening pages (usually the table of contents). With a query it returns the best-matching pages; with from_page/to_page it returns those PDF pages (max 15).", { source_id: str, query: { ...str, description: "words to look for, or empty" }, from_page: { ...int, description: "0 = none" }, to_page: { ...int, description: "0 = none" } }, ["source_id", "query", "from_page", "to_page"]),
  tool("set_plan", "Replace the whole suggested list of classes (the ones she hasn't made yet) with this list, in teaching order.", { classes: { type: "array", items: cls } }, ["classes"]),
  tool("edit_class", "Change one suggested class. Empty / 0 keeps a field.", { class_id: str, week: int, topic: str, premise: str, basis: str }, ["class_id", "week", "topic", "premise", "basis"]),
  tool("add_class", "Add a suggested class after another (empty = at the end).", { after_class_id: str, ...cls.properties }, ["after_class_id", ...cls.required]),
  tool("remove_class", "Remove a suggested class.", { class_id: str }, ["class_id"]),
];

const SYSTEM = `You help Tanya, an adjunct professor of art (MFA in photography) in Chicago, plan a semester for one course. Her students are undergraduates at City Colleges of Chicago and similar colleges, many new to art.

Follow her instructions exactly and completely, like a careful researcher:
- Do what she asks, all of it, in the way she asks. If she asks you to look at how other colleges teach the course, search for real course outlines, catalog descriptions and syllabi (City Colleges of Chicago first if she says so), read them, and say which ones you found and what you took from each, with links. If you can't find something, say so plainly — never fill the gap with a guess.
- Her course sources (textbooks she prescribes, documents she uploaded) come first. Read them with read_source before relying on them. Base the order and content of classes on them when she asks, and put the chapter/pages in each class's "basis". Chapter titles, numbers and pages only from what read_source returned.
- Never state that a college, book or document says or teaches something unless a page you actually read says it. Cite those pages in each class's sources.
- In your reply, keep three things apart: what you found (with links), what you inferred from it, and what you assumed or chose yourself.
- Topics and premises are teaching ideas: no dates, attributions or numbers in them (each class's facts are researched and sourced when it is made).
- Make the changes with the tools (set_plan for a full outline, edit/add/remove for tweaks), then reply briefly: what you did, what it's based on, anything you couldn't do.`;

type InSource = { id: string; title: string; kind: "textbook" | "document"; textId?: string; link?: string };
type Hist = { role: "user" | "assistant"; text: string };
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const rid = () => Math.random().toString(36).slice(2, 10);

export async function planChat(input: {
  course: string;
  weeks: number;
  perWeek: number;
  minutes?: number;
  existing: { number: number; topic: string; made: boolean }[];
  items: PlanItem[];
  sources: InSource[];
  use: string[];
  history: Hist[];
  message: string;
}) {
  if (!claudeOn()) throw new NoClaude();
  let items = input.items.map((x) => ({ ...x }));
  const changes: string[] = [];
  const retrieved = new Map<string, string>();
  const known = new Map<string, string>(); // exact citation links from read_source
  const cited: Source[] = [];
  const byId = new Map(input.sources.map((x) => [x.id, x]));
  const total = Math.max(1, input.weeks) * Math.max(1, input.perWeek);
  const made = input.existing.filter((e) => e.made).length;

  const ground = (list: unknown): Source[] => {
    const out: Source[] = [];
    for (const x of Array.isArray(list) ? list : []) {
      const url = s((x as Source)?.url);
      const title = s((x as Source)?.title);
      if (!url || out.some((o) => o.url === url)) continue;
      if (known.has(url) || retrieved.has(normUrl(url))) out.push({ title: title || known.get(url) || retrieved.get(normUrl(url)) || url, url });
    }
    return out;
  };
  const toItem = (a: Record<string, unknown>): PlanItem => ({
    id: rid(),
    week: Math.max(1, Math.min(input.weeks, Number(a.week) || 1)),
    topic: s(a.topic).slice(0, 140),
    premise: s(a.premise).slice(0, 400),
    theme: s(a.theme) || undefined,
    basis: s(a.basis).slice(0, 200) || undefined,
    sources: ground(a.sources),
    use: true,
  });

  async function readSource(a: Record<string, unknown>): Promise<string> {
    const src = byId.get(s(a.source_id));
    if (!src) return "Unknown source id.";
    if (!src.textId) return `“${src.title}” has no readable text stored (save its PDF in the Library, or upload the document here).`;
    if (!dbConfigured()) return "Stored documents can't be read on this setup.";
    const f = await db().get<{ kind: string; data: string }>(K(`file:${src.textId}`));
    if (!f?.data) return `Couldn't open “${src.title}”.`;
    const all = f.data;
    const paged = /--- Page \d+ ---\n/.test(all);
    const cite = (page?: number) => {
      const url = page && src.link ? `${src.link}#page=${page}` : src.link ?? `/api/file/${src.textId}`;
      const title = page ? `${src.title}, PDF p. ${page}` : src.title;
      known.set(url, title);
      return `[cite as: ${title} — ${url}]`;
    };
    const from = Number(a.from_page) || 0;
    const to = Number(a.to_page) || 0;
    const q = s(a.query);
    if (paged && from > 0) {
      const end = Math.min(to || from, from + 14);
      const text = slicePages(all, from, end);
      for (let p = from; p <= end; p++) cite(p);
      return text ? `${text.slice(0, 30_000)}\n\n${cite(from)}${end > from ? ` … ${cite(end)}` : ""}` : "No text on those pages.";
    }
    if (paged && q) {
      const pages = bestPages(all, q, 6);
      if (!pages.length) return "No pages matched those words.";
      return pages.map((p) => `[PDF page ${p.page}] ${cite(p.page)}\n${p.text.slice(0, 3000)}`).join("\n\n");
    }
    if (paged) return `${slicePages(all, 1, 12).slice(0, 16_000)}\n\n${cite(1)}`;
    // a document without page markers (Word, text)
    const hit = q ? all.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0] ?? "") : -1;
    const start = hit > 2000 ? hit - 2000 : 0;
    return `${all.slice(start, start + 16_000)}\n\n${cite()}`;
  }

  const snapshot = () =>
    `COURSE: ${input.course}\nLENGTH: ${input.weeks} weeks × ${input.perWeek} classes a week${input.minutes ? `, ${input.minutes} min each` : ""} = ${total} classes.\n` +
    `CLASSES SHE ALREADY HAS (${input.existing.length}; ${made} already made — keep those and plan around them):\n${input.existing.map((e) => `${e.number}. ${e.topic}${e.made ? " [made]" : " [not made yet]"}`).join("\n") || "(none)"}\n\n` +
    `HER COURSE SOURCES (use these first; read them with read_source):\n${input.sources.map((x) => `- [${x.id}] ${x.kind}: ${x.title}${input.use.includes(x.id) ? " [she chose this for the plan]" : ""}${x.textId ? "" : " (no text stored)"}`).join("\n") || "(none yet)"}\n\n` +
    `CURRENT SUGGESTED LIST (${items.length}):\n${items.map((x) => `[${x.id}] week ${x.week}: ${x.topic} — ${x.premise}${x.basis ? ` (basis: ${x.basis})` : ""}`).join("\n") || "(empty)"}\n` +
    `A full plan has ${total} classes; unless she says otherwise, the suggested list covers the ${Math.max(0, total - made)} classes not yet made.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history.slice(-12).map((m) => ({ role: m.role, content: m.text || "…" })),
    { role: "user", content: `${snapshot()}\n\n---\nTANYA: ${input.message}` },
  ];
  while (messages.length && messages[0].role !== "user") messages.shift();

  let reply = "";
  for (let turn = 0; turn < 14; turn++) {
    const msg = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" }, // stays inside the 5-minute server limit
        system: SYSTEM,
        tools: TOOLS,
        messages,
      } as Anthropic.Beta.MessageCreateParamsStreaming)
      .finalMessage();
    if (msg.stop_reason === "refusal") throw new Error("Claude declined that request. Try rewording it.");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of msg.content) {
      if (b.type === "text") {
        reply += b.text;
        for (const c of b.citations ?? []) {
          if (c.type !== "web_search_result_location") continue;
          retrieved.set(normUrl(c.url), c.title ?? c.url);
          if (!cited.some((x) => x.url === c.url)) cited.push({ title: c.title ?? c.url, url: c.url });
        }
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") retrieved.set(normUrl(r.url), r.title);
      if (b.type !== "tool_use") continue;
      const a = (b.input ?? {}) as Record<string, unknown>;
      const ok = (text: string) => results.push({ type: "tool_result", tool_use_id: b.id, content: text });
      const bad = (text: string) => results.push({ type: "tool_result", tool_use_id: b.id, content: text, is_error: true });
      try {
        switch (b.name) {
          case "read_source":
            ok(await readSource(a));
            break;
          case "set_plan": {
            const list = (Array.isArray(a.classes) ? a.classes : []).map((x) => toItem(x as Record<string, unknown>)).filter((x) => x.topic);
            if (!list.length) { bad("The list was empty."); break; }
            items = list;
            changes.push(`New outline: ${list.length} classes`);
            ok(`Done. ${list.reduce((n, x) => n + (x.sources?.length ? 0 : 1), 0)} classes have no source that you actually read.`);
            break;
          }
          case "edit_class": {
            const it = items.find((x) => x.id === s(a.class_id));
            if (!it) { bad("Unknown class id."); break; }
            if (Number(a.week) > 0) it.week = Math.min(input.weeks, Number(a.week));
            if (s(a.topic)) it.topic = s(a.topic);
            if (s(a.premise)) it.premise = s(a.premise);
            if (s(a.basis)) it.basis = s(a.basis);
            changes.push(`Changed: ${it.topic}`);
            ok("Done.");
            break;
          }
          case "add_class": {
            const n = toItem(a);
            const i = items.findIndex((x) => x.id === s(a.after_class_id));
            items.splice(i >= 0 ? i + 1 : items.length, 0, n);
            changes.push(`Added: ${n.topic}`);
            ok(`Done (id ${n.id}).`);
            break;
          }
          case "remove_class": {
            const it = items.find((x) => x.id === s(a.class_id));
            if (!it) { bad("Unknown class id."); break; }
            items = items.filter((x) => x !== it);
            changes.push(`Removed: ${it.topic}`);
            ok("Done.");
            break;
          }
          default:
            bad("Unknown tool.");
        }
      } catch (e) {
        bad((e as Error).message);
      }
    }
    if (msg.stop_reason === "tool_use" && results.length) {
      messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      messages.push({ role: "user", content: results });
      reply = "";
      continue;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    break;
  }
  items.sort((x, y) => x.week - y.week);
  return { reply: reply.trim() || (changes.length ? "Done." : "…"), sources: cited.slice(0, 12), items, changes, changed: changes.length > 0 };
}
