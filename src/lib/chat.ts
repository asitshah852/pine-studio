// "Talk it through": a conversation about the class in Prep. Claude can discuss, search the web
// (facts must be sourced), search the museums for exhibits, and change the research document and
// slides through tools. The changes are returned as operations; the browser applies them (with undo).
import type Anthropic from "@anthropic-ai/sdk";
import { MODEL, claudeOn, getClient, groundSources, NoClaude, normUrl } from "./claude";
import { caption } from "./museum";
import { searchSources } from "./search";
import { HOUSE } from "./prompts";
import type { Artwork, ChatOp, Lesson, Source } from "./types";

type B = Anthropic.Beta.Messages.BetaToolUnion;
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[]): B => ({
  name,
  description,
  input_schema: { type: "object", properties, required, additionalProperties: false },
  eager_input_streaming: true,
});
const str = { type: "string" };
const layout = { type: "string", enum: ["title", "text", "artwork", "compare"] };

const TOOLS: B[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  tool("find_exhibits", "Find exhibits: art in the Art Institute of Chicago, The Met and the Cleveland Museum of Art; historic photographs, posters and prints in the Library of Congress; or videos on YouTube (official channels only — use sparingly, each search uses part of a small daily allowance). Returns items with a ref to use in add_exhibit.", { query: { ...str, description: "artist, title, movement or subject — or a YouTube video link" }, source: { type: "string", enum: ["all", "museums", "library_of_congress", "youtube"], description: "all = museums + Library of Congress" } }, ["query", "source"]),
  tool("add_exhibit", "Add a work found with find_exhibits to the class's exhibit list, and optionally put it on a slide.", { ref: str, why: { ...str, description: "one sentence: why it fits this class" }, slide_id: { ...str, description: "slide to place it on, or empty" } }, ["ref", "why", "slide_id"]),
  tool("edit_slide", "Change a slide's title, talking points (3–5 short bullets, one per line) or layout. Leave a field empty to keep it.", { slide_id: str, title: str, talking_points: str, layout: { ...layout, description: "or empty" } }, ["slide_id", "title", "talking_points", "layout"]),
  tool("add_slide", "Add a new slide after the given slide (empty = at the end).", { after_slide_id: str, title: str, talking_points: str, layout }, ["after_slide_id", "title", "talking_points", "layout"]),
  tool("delete_slide", "Delete a slide.", { slide_id: str }, ["slide_id"]),
  tool("move_slide", "Move a slide to a new position (1 = first).", { slide_id: str, position: { type: "integer" } }, ["slide_id", "position"]),
  tool("edit_research_paragraph", "Rewrite a paragraph of the research document (keep its facts unless correcting them).", { paragraph_id: str, text: str }, ["paragraph_id", "text"]),
  tool("add_research_paragraph", "Add a paragraph of sourced facts to the research document, in an existing section or a new one. Sources must be pages you retrieved with web_search in this conversation.", {
    section_id: { ...str, description: "existing section id, or empty to start a new section" },
    new_section_heading: { ...str, description: "heading if starting a new section, else empty" },
    text: str,
    sources: { type: "array", items: { type: "object", properties: { title: str, url: str }, required: ["title", "url"], additionalProperties: false } },
  }, ["section_id", "new_section_heading", "text", "sources"]),
  tool("add_discussion_question", "Add a discussion question for students.", { text: str }, ["text"]),
  tool("show_slide", "Show her a slide in the editor (e.g. 'go to slide 5').", { slide_id: str }, ["slide_id"]),
  tool("fact_check_slides", "Fact-check the slides that changed since their last check.", {}, []),
  tool("remake_slides", "Rebuild the whole deck from the research document (the current slides are kept as an earlier version).", { count: { type: "integer", description: "about how many slides, 8–22" } }, ["count"]),
  tool("research_again", "Write a fresh research document for the class (the current one is kept as an earlier version). Takes 2–3 minutes.", {}, []),
  tool("finish_class", "Finish the class: fact-check anything not yet checked, then mark it ready for class (it appears in Classes). Use when she says finish up, wrap up, I'm done, or similar.", {}, []),
];

const SYSTEM = `${HOUSE}

You are now talking with Tanya inside her prep tool about one class. Be a warm, sharp colleague: discuss ideas, answer questions, and when she asks for changes, make them with the tools (don't just describe them). Keep replies short (a few sentences) and say plainly what you changed.
- Facts in your replies or in anything you add must come from web_search results in this conversation; cite them. If you can't source something, say so.
- If YouTube search is switched off, ask her to paste the video's YouTube link; find_exhibits with that link as the query works without the key.
- Exhibits only come from find_exhibits (real museum, Library of Congress or YouTube records). Never invent a work, record or video. For YouTube, prefer official artist, label or museum channels and say which channel it is.
- Talking points: 3–5 short bullets in plain spoken language; on exhibit slides they link the research to the work on screen.
- Refer to slides by their number, not their id.
- She can run the whole deck through you. "Finish up" / "wrap it up" / "I'm done" → finish_class (unconfirmed facts don't stop it). "Check it" → fact_check_slides. "Show me slide N" → show_slide. "Start the slides over" → remake_slides. Long jobs run after your reply; say they've started.`;

function snapshot(l: Lesson, course: string): string {
  const d = l.research;
  const doc = d
    ? d.sections.map((s) => `## [sec:${s.id}] ${s.heading}\n${s.paragraphs.map((p) => `[p:${p.id}] ${p.text}`).join("\n")}`).join("\n\n") +
      (d.questions.length ? `\n\nQuestions: ${d.questions.join(" | ")}` : "") +
      (d.exhibits.length ? `\n\nExhibit list: ${d.exhibits.filter((e) => e.match).map((e) => `${e.match!.title} (${e.match!.museum})${e.use ? " [chosen]" : ""}`).join("; ")}` : "")
    : "(no research document yet)";
  const slides = l.slides.length
    ? l.slides
        .map((s, i) => `Slide ${i + 1} [id:${s.id}] (${s.layout}) ${s.title}${s.artworks.length ? ` — shows: ${s.artworks.map((a) => a.title).join(", ")}` : ""}\n${s.body}`)
        .join("\n\n")
    : "(no slides yet)";
  return `CLASS: ${course} · Class ${l.number}: ${l.topic}\nPremise: ${l.premise || "(none)"}\n\nRESEARCH DOCUMENT:\n${doc}\n\nSLIDES:\n${slides}`;
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function chat(input: { lesson: Lesson; course: string; history: { role: "user" | "assistant"; text: string }[]; message: string; current?: string | null }) {
  if (!claudeOn()) throw new NoClaude();
  const l = input.lesson;
  const slideIds = new Set(l.slides.map((x) => x.id));
  const paraIds = new Set(l.research?.sections.flatMap((x) => x.paragraphs.map((p) => p.id)) ?? []);
  const sectionIds = new Set(l.research?.sections.map((x) => x.id) ?? []);
  const found = new Map<string, Artwork>();
  const retrieved = new Map<string, string>();
  const ops: ChatOp[] = [];
  const pos = (id: string) => l.slides.findIndex((x) => x.id === id) + 1;

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...input.history.slice(-12).map((m) => ({ role: m.role, content: m.text || "…" })),
    {
      role: "user",
      content: `${snapshot(l, input.course)}${
        input.current && slideIds.has(input.current) ? `\n\nShe is looking at Slide ${pos(input.current)} [id:${input.current}] right now — "this slide" means that one.` : ""
      }\n\n---\nTANYA: ${input.message}`,
    },
  ];
  while (messages.length && messages[0].role !== "user") messages.shift();

  let reply = "";
  const cited: Source[] = [];
  for (let turn = 0; turn < 10; turn++) {
    const msg = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
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
          if (c.type === "web_search_result_location" && !cited.some((x) => x.url === c.url)) cited.push({ title: c.title ?? c.url, url: c.url });
          if (c.type === "web_search_result_location") retrieved.set(normUrl(c.url), c.title ?? c.url);
        }
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") retrieved.set(normUrl(r.url), r.title);
      if (b.type !== "tool_use") continue;
      const a = (b.input ?? {}) as Record<string, unknown>;
      const ok = (text: string) => results.push({ type: "tool_result", tool_use_id: b.id, content: text });
      const bad = (text: string) => results.push({ type: "tool_result", tool_use_id: b.id, content: text, is_error: true });
      try {
        switch (b.name) {
          case "find_exhibits": {
            const q = s(a.query);
            if (!q) { bad("Empty query."); break; }
            const src = s(a.source) === "youtube" ? "youtube" : s(a.source) === "library_of_congress" ? "loc" : s(a.source) === "museums" ? "museums" : "all";
            const { results, errors } = await searchSources(q, src);
            const works = results.slice(0, 14);
            if (!works.length && errors.length) { bad(errors.join("; ")); break; }
            const ref = (w: Artwork) => `${({ "The Met": "met", "Cleveland Museum of Art": "cma", "Library of Congress": "loc", YouTube: "yt", "Art Institute of Chicago": "aic" } as const)[w.museum]}:${w.id}`;
            works.forEach((w) => found.set(ref(w), w));
            ok(works.length ? works.map((w) => `ref ${ref(w)} — ${caption(w)} — ${w.video ? `YouTube video, channel “${w.video.channel}” (${w.credit})` : w.publicDomain ? "free to use" : "rights to check (preview only)"}`).join("\n") : "No works found. Try different words.");
            break;
          }
          case "add_exhibit": {
            const w = found.get(s(a.ref));
            if (!w) { bad("Unknown ref: use a ref returned by find_exhibits in this conversation."); break; }
            const sid = s(a.slide_id);
            if (sid && !slideIds.has(sid)) { bad("Unknown slide id."); break; }
            ops.push({ op: "add_exhibit", label: `Added ${w.title} (${w.museum})${sid ? ` to slide ${pos(sid)}` : " to the exhibit list"}`, artwork: w, why: s(a.why), slideId: sid || undefined });
            ok("Done.");
            break;
          }
          case "edit_slide": {
            const id = s(a.slide_id);
            if (!slideIds.has(id)) { bad("Unknown slide id."); break; }
            const lay = s(a.layout) as "title" | "text" | "artwork" | "compare" | "";
            ops.push({ op: "edit_slide", label: `Edited slide ${pos(id)}`, slideId: id, title: s(a.title) || undefined, body: s(a.talking_points) || undefined, layout: lay || undefined });
            ok("Done.");
            break;
          }
          case "add_slide": {
            const after = s(a.after_slide_id);
            const lay = (s(a.layout) || "text") as "title" | "text" | "artwork" | "compare";
            ops.push({ op: "add_slide", label: `Added a slide: ${s(a.title)}`, afterId: slideIds.has(after) ? after : undefined, title: s(a.title), body: s(a.talking_points), layout: lay });
            ok("Done.");
            break;
          }
          case "delete_slide": {
            const id = s(a.slide_id);
            if (!slideIds.has(id)) { bad("Unknown slide id."); break; }
            ops.push({ op: "delete_slide", label: `Deleted slide ${pos(id)}`, slideId: id });
            ok("Done.");
            break;
          }
          case "move_slide": {
            const id = s(a.slide_id);
            if (!slideIds.has(id)) { bad("Unknown slide id."); break; }
            const to = Math.max(1, Number(a.position) || 1);
            ops.push({ op: "move_slide", label: `Moved slide ${pos(id)} to position ${to}`, slideId: id, to });
            ok("Done.");
            break;
          }
          case "edit_research_paragraph": {
            const id = s(a.paragraph_id);
            if (!paraIds.has(id)) { bad("Unknown paragraph id."); break; }
            ops.push({ op: "edit_paragraph", label: "Edited a research paragraph", paragraphId: id, text: s(a.text) });
            ok("Done.");
            break;
          }
          case "add_research_paragraph": {
            const sources = groundSources(a.sources as { title?: string; url?: string }[], retrieved);
            const sec = s(a.section_id);
            ops.push({
              op: "add_paragraph",
              label: `Added research${sources.length ? "" : " (no source found — marked to check)"}`,
              sectionId: sectionIds.has(sec) ? sec : undefined,
              heading: s(a.new_section_heading) || undefined,
              text: s(a.text),
              sources,
              verified: sources.length > 0,
            });
            ok(sources.length ? "Done." : "Added, but none of those sources were retrieved in this conversation, so it is marked unverified. Search first if you can.");
            break;
          }
          case "show_slide": {
            const id = s(a.slide_id);
            if (!slideIds.has(id)) { bad("Unknown slide id."); break; }
            ops.push({ op: "goto_slide", label: `Showing slide ${pos(id)}`, slideId: id });
            ok("Done.");
            break;
          }
          case "fact_check_slides":
            ops.push({ op: "run_check", label: "Fact-check started" });
            ok("The fact-check will run right after your reply.");
            break;
          case "remake_slides":
            ops.push({ op: "run_slides", label: "Remaking the slides from the research", count: Math.min(22, Math.max(8, Number(a.count) || 12)) });
            ok("The slides will be rebuilt right after your reply (1–2 minutes).");
            break;
          case "research_again":
            ops.push({ op: "run_research", label: "Researching again" });
            ok("New research will start right after your reply (2–3 minutes).");
            break;
          case "finish_class":
            ops.push({ op: "finish", label: "Finishing: checking any new slides, then marking the class ready" });
            ok("Finishing will run right after your reply.");
            break;
          case "add_discussion_question": {
            ops.push({ op: "add_question", label: "Added a discussion question", text: s(a.text) });
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
      reply = ""; // keep only the final answer's text
      continue;
    }
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
      continue;
    }
    break;
  }
  return { reply: reply.trim() || (ops.length ? "Done." : "…"), sources: cited.slice(0, 8), ops };
}
