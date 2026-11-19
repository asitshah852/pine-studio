// Slide building and fact-check state. Pure functions (tested in tests/slides.test.ts).
import type { DragItem } from "./drag";
import { caption } from "./museum";
import type { Claim, Lesson, Slide, Source } from "./types";

export const newId = () => Math.random().toString(36).slice(2, 10);

export function blankSlide(layout: Slide["layout"] = "text", title = ""): Slide {
  return { id: newId(), layout, title, body: "", notes: "", images: [], artworks: [], sources: [] };
}

const addSources = (cur: Source[], more: Source[]) => {
  const seen = new Set(cur.map((s) => s.url));
  return [...cur, ...more.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url))];
};

/** Make a new slide from something dropped on the strip. */
export function slideFrom(item: DragItem): Slide {
  return addTo(blankSlide(item.kind === "text" ? "text" : "artwork", item.kind === "text" ? item.heading ?? "" : ""), item);
}

/** Add a dropped thing to an existing slide. */
export function addTo(slide: Slide, item: DragItem): Slide {
  const s: Slide = { ...slide, check: undefined }; // any change needs a fresh check
  if (item.kind === "artwork") {
    const a = item.artwork;
    s.artworks = [...s.artworks.filter((x) => !(x.museum === a.museum && x.id === a.id)), a];
    if (a.imageUrl) s.images = [...s.images, { url: a.imageUrl, credit: caption(a), rights: "public-domain" }];
    // Still in copyright: use the museum's own preview (AIC allows up to 843px) and flag it.
    else if (a.thumbUrl)
      s.images = [...s.images, { url: a.thumbUrl.replace("/full/400,/", "/full/843,/"), credit: caption(a), rights: "check" }];
    s.sources = addSources(s.sources, [{ title: `${a.museum}: ${a.title}`, url: a.url }]);
    if (!s.title) s.title = a.title;
    if (s.layout === "title" || s.layout === "text") s.layout = "artwork";
    if (s.artworks.length >= 2 && s.layout === "artwork") s.layout = "compare";
    return s;
  }
  if (item.kind === "image") {
    s.images = [...s.images, { url: item.url, credit: item.credit, rights: item.rights }];
    if (s.layout === "text" || s.layout === "title") s.layout = "artwork";
    return s;
  }
  s.body = [s.body.trim(), item.text.trim()].filter(Boolean).join("\n");
  s.sources = addSources(s.sources, item.sources);
  return s;
}

/** What still needs checking, sent to /api/check. Museum captions are sourced by the record itself. */
export function checkItems(slides: Slide[]) {
  return slides
    .map((s) => ({ id: s.id, text: [s.title, s.body, s.notes && `Speaker notes: ${s.notes}`].filter(Boolean).join("\n") }))
    .filter((i) => i.text.trim());
}

export type SlideState = "unchecked" | "ok" | "unverified" | "problem";

export function slideState(s: Slide): SlideState {
  if (!s.check) return [s.title, s.body, s.notes].some((t) => t.trim()) ? "unchecked" : "ok";
  if (s.check.claims.some((c) => c.verdict === "contradicted")) return "problem";
  if (s.check.claims.some((c) => c.verdict === "unverified")) return "unverified";
  return "ok";
}

/** Put check results back onto their slides. */
export function applyCheck(slides: Slide[], claims: Claim[], at: string): Slide[] {
  return slides.map((s) => ({ ...s, check: { at, claims: claims.filter((c) => c.slideId === s.id) } }));
}

export function readiness(l: Lesson): { ok: boolean; problems: number; unverified: number; unchecked: number; rights: number } {
  const states = l.slides.map(slideState);
  const rights = l.slides.reduce((n, s) => n + s.images.filter((i) => i.rights === "check").length, 0);
  const problems = states.filter((x) => x === "problem").length;
  const unchecked = states.filter((x) => x === "unchecked").length;
  const unverified = states.filter((x) => x === "unverified").length;
  return { ok: l.slides.length > 0 && !problems && !unchecked, problems, unverified, unchecked, rights };
}

/** Every source in the deck, for the closing Sources slide. */
export function deckSources(slides: Slide[]): Source[] {
  return slides.reduce<Source[]>((acc, s) => addSources(acc, s.sources), []);
}

/** Apply one accepted suggestion: new wording for a slide, or an extra slide after it. */
export function applySuggestion(slides: Slide[], s: import("./types").Suggestion): Slide[] {
  let out = slides;
  if (s.change && s.slideId) {
    out = out.map((x) =>
      x.id === s.slideId
        ? {
            ...x,
            title: s.change!.title ?? x.title,
            body: s.change!.body ?? x.body,
            notes: s.change!.notes ?? x.notes,
            sources: addSources(x.sources, s.sources),
            check: undefined,
          }
        : x,
    );
  }
  if (s.newSlide) {
    const n: Slide = { ...blankSlide("text", s.newSlide.title), body: s.newSlide.body, notes: s.newSlide.notes, sources: s.sources };
    const i = s.slideId ? out.findIndex((x) => x.id === s.slideId) : -1;
    out = i >= 0 ? [...out.slice(0, i + 1), n, ...out.slice(i + 1)] : [...out, n];
  }
  return out;
}

/** A closing discussion slide from chosen questions. */
export function discussionSlide(questions: string[]): Slide {
  return { ...blankSlide("text", "Discuss"), body: questions.join("\n") };
}
