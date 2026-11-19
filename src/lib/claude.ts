// Server-side Claude calls. Claude writes summaries, outlines and questions; it is never a
// source of facts on its own. Every fact must come back with a source URL that the web-search
// tool actually retrieved in this same request; any other URL is dropped and the fact is
// marked unverified.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const claudeOn = () => Boolean(process.env.ANTHROPIC_API_KEY) && process.env.CLAUDE_OFF !== "1";

let client: Anthropic | null = null;
export const getClient = () => (client ??= new Anthropic());

export class NoClaude extends Error {
  constructor() {
    super("Claude isn't switched on yet: add ANTHROPIC_API_KEY in Vercel (see SETUP.md).");
  }
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

export type ClaudeResult = { text: string; retrieved: Map<string, string> }; // url -> title

export const normUrl = (u: string) =>
  u.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();

/** One request, optionally with web search; follows pause_turn; collects every URL search returned. */
export async function ask(opts: {
  system: string;
  content: Content;
  search?: number; // max web searches (0 = no web)
  effort?: "low" | "medium" | "high";
}): Promise<ClaudeResult> {
  if (!claudeOn()) throw new NoClaude();
  const tools: Anthropic.Beta.BetaToolUnion[] = opts.search
    ? [{ type: "web_search_20260209", name: "web_search", max_uses: opts.search }]
    : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.content }];
  const retrieved = new Map<string, string>();
  let text = "";
  for (let turn = 0; turn < 4; turn++) {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      // On a safety decline the API retries on a fallback model inside the same call.
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "medium" },
      system: opts.system,
      tools,
      messages,
    } as Anthropic.Beta.MessageCreateParamsStreaming);
    const msg = await stream.finalMessage();
    for (const b of msg.content) {
      if (b.type === "text") {
        text += b.text;
        for (const c of b.citations ?? []) {
          if (c.type === "web_search_result_location") retrieved.set(normUrl(c.url), c.title ?? c.url);
        }
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === "web_search_result") retrieved.set(normUrl(r.url), r.title);
      }
    }
    if (msg.stop_reason === "refusal") throw new Error("Claude declined this request. Try rewording the topic.");
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
  }
  return { text, retrieved };
}

/** Pull the last JSON object out of a reply (tolerates prose and code fences around it). */
export function parseJson<T>(text: string): T {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...fenced.reverse(), text];
  for (const c of candidates) {
    const s = c.indexOf("{");
    const e = c.lastIndexOf("}");
    if (s === -1 || e <= s) continue;
    try {
      return JSON.parse(c.slice(s, e + 1)) as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("Claude's answer couldn't be read. Please try again.");
}

/** Keep only sources that web search really returned in this request. */
export function groundSources(
  sources: { title?: string; url?: string }[] | undefined,
  retrieved: Map<string, string>,
  loose = false,
): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  const host = (k: string) => k.split("/")[0];
  for (const s of sources ?? []) {
    if (!s?.url) continue;
    const k = normUrl(s.url);
    if (retrieved.has(k)) {
      if (!seen.has(k)) out.push({ title: s.title || retrieved.get(k) || s.url, url: s.url });
      seen.add(k);
      continue;
    }
    // Loose (fact-check): the cited page wasn't fetched exactly, but a page on the same site was —
    // keep that real, retrieved page as the source.
    if (loose) {
      const same = [...retrieved.keys()].find((r) => host(r) === host(k) && !seen.has(r));
      if (same) {
        seen.add(same);
        out.push({ title: retrieved.get(same) || s.title || same, url: `https://${same}` });
      }
    }
  }
  return out;
}
