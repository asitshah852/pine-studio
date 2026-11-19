// Replacing research, slides or a review always keeps the old one (last 5 of each) so it can be restored.
import { newId } from "./slides";
import type { Claim, Lesson, ResearchDoc, ReviewDoc, Slide, Source, Version } from "./types";

const KEEP = 5;
const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "" : d.toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export function keepVersion(l: Lesson, kind: Version["kind"]): Version[] {
  const versions = l.versions ?? [];
  const cur = kind === "research" ? l.research : kind === "review" ? l.review : l.slides.length ? l.slides : undefined;
  if (!cur) return versions;
  const made = kind === "research" ? l.research?.at : kind === "review" ? l.review?.at : undefined;
  const v: Version = {
    id: newId(),
    kind,
    at: new Date().toISOString(),
    label: kind === "slides" ? `${l.slides.length} slides, replaced ${when(new Date().toISOString())}` : `${kind} from ${when(made ?? new Date().toISOString())}`,
    [kind]: cur,
  };
  const same = versions.filter((x) => x.kind === kind);
  const others = versions.filter((x) => x.kind !== kind);
  return [v, ...same].slice(0, KEEP).concat(others);
}

export const withResearch = (l: Lesson, research: ResearchDoc | undefined): Lesson => ({ ...l, versions: keepVersion(l, "research"), research });
export const withSlides = (l: Lesson, slides: Slide[]): Lesson => ({ ...l, versions: keepVersion(l, "slides"), slides });
export const withReview = (l: Lesson, review: ReviewDoc | undefined): Lesson => ({ ...l, versions: keepVersion(l, "review"), review });

export function withCheck(l: Lesson, res: { claims: Claim[]; at: string }, ids: string[]): Lesson {
  const set = new Set(ids);
  return { ...l, checkedAt: res.at, slides: l.slides.map((s) => (set.has(s.id) ? { ...s, check: { at: res.at, claims: res.claims.filter((c) => c.slideId === s.id) } } : s)) };
}

/** Bring back an earlier version; the current one is kept in its place. */
export function restore(l: Lesson, v: Version): Lesson {
  const rest = { ...l, versions: (l.versions ?? []).filter((x) => x.id !== v.id) };
  if (v.kind === "research") return withResearch(rest, v.research);
  if (v.kind === "review") return withReview(rest, v.review);
  return withSlides(rest, v.slides ?? []);
}

// ── Changes made from the "talk it through" chat ─────────────────────────────
import { addTo, blankSlide } from "./slides";
import type { ChatMessage, ChatOp, ResearchDoc as RD } from "./types";

const emptyDoc = (): RD => ({ at: new Date().toISOString(), overview: "", sections: [], questions: [], exhibits: [] });

export function applyOps(l: Lesson, ops: ChatOp[]): Lesson {
  let slides = [...l.slides];
  let doc: RD | undefined = l.research;
  const touch = (id: string, fn: (s: Slide) => Slide) => (slides = slides.map((s) => (s.id === id ? { ...fn(s), check: undefined } : s)));
  for (const o of ops) {
    if (o.op === "edit_slide") touch(o.slideId, (s) => ({ ...s, title: o.title ?? s.title, body: o.body ?? s.body, layout: o.layout ?? s.layout }));
    else if (o.op === "add_slide") {
      const n = { ...blankSlide(o.layout ?? "text", o.title), body: o.body };
      const i = o.afterId ? slides.findIndex((s) => s.id === o.afterId) : -1;
      slides = i >= 0 ? [...slides.slice(0, i + 1), n, ...slides.slice(i + 1)] : [...slides, n];
    } else if (o.op === "delete_slide") slides = slides.filter((s) => s.id !== o.slideId);
    else if (o.op === "move_slide") {
      const i = slides.findIndex((s) => s.id === o.slideId);
      if (i >= 0) {
        const [m] = slides.splice(i, 1);
        slides.splice(Math.min(slides.length, o.to - 1), 0, m);
      }
    } else if (o.op === "edit_paragraph" && doc)
      doc = { ...doc, sections: doc.sections.map((sec) => ({ ...sec, paragraphs: sec.paragraphs.map((p) => (p.id === o.paragraphId ? { ...p, text: o.text, edited: true } : p)) })) };
    else if (o.op === "add_paragraph") {
      doc = doc ?? emptyDoc();
      const para = { id: newId(), text: o.text, sources: o.sources, verified: o.verified };
      doc = o.sectionId && doc.sections.some((x) => x.id === o.sectionId)
        ? { ...doc, sections: doc.sections.map((x) => (x.id === o.sectionId ? { ...x, paragraphs: [...x.paragraphs, para] } : x)) }
        : { ...doc, sections: [...doc.sections, { id: newId(), heading: o.heading || "Added in conversation", paragraphs: [para] }] };
    } else if (o.op === "add_question") {
      doc = doc ?? emptyDoc();
      doc = { ...doc, questions: [...doc.questions, o.text] };
    } else if (o.op === "add_exhibit") {
      doc = doc ?? emptyDoc();
      if (!doc.exhibits.some((e) => e.match?.url === o.artwork.url))
        doc = { ...doc, exhibits: [...doc.exhibits, { id: newId(), suggested: o.artwork.title, why: o.why, match: o.artwork, use: true }] };
      if (o.slideId) touch(o.slideId, (s) => addTo(s, { kind: "artwork", artwork: o.artwork }));
    }
  }
  return { ...l, slides, research: doc };
}

/** Add a chat exchange; apply its changes with an undo snapshot (only the newest change keeps one). */
export function withChat(l: Lesson, user: ChatMessage | undefined, reply: { reply: string; sources: Source[]; ops: ChatOp[] }): Lesson {
  const undo = reply.ops.length ? { slides: l.slides, research: l.research } : undefined;
  const changed = reply.ops.length ? applyOps(l, reply.ops) : l;
  const prev = (l.chat ?? []).filter((m) => m.id !== user?.id).map((m) => (undo && m.undo ? { ...m, undo: undefined } : m));
  const msg: ChatMessage = { id: newId(), role: "assistant", text: reply.reply, at: new Date().toISOString(), sources: reply.sources, ops: reply.ops.map((o) => o.label), undo };
  return { ...changed, chat: [...prev, ...(user ? [user] : []), msg].slice(-40) };
}

export function undoChat(l: Lesson, msgId: string): Lesson {
  const m = (l.chat ?? []).find((x) => x.id === msgId);
  if (!m?.undo) return l;
  return { ...l, slides: m.undo.slides, research: m.undo.research, chat: (l.chat ?? []).map((x) => (x.id === msgId ? { ...x, undo: undefined, undone: true } : x)) };
}
