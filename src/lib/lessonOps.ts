// Replacing research, slides or a review always keeps the old one (last 5 of each) so it can be restored.
import { newId } from "./slides";
import type { Claim, Lesson, ResearchDoc, ReviewDoc, Slide, Version } from "./types";

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
