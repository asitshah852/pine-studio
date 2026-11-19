"use client";
// The class-making steps, shared by the step-by-step buttons and the one-click "make my class".
// Each request carries a job key, so a result that finishes after the page closed is picked up later.
import { api, load } from "./client";
import { textbookExcerpts } from "./textbooks";
import { forget } from "./jobs";
import { withCheck, withResearch, withSlides } from "./lessonOps";
import { checkItems } from "./slides";
import type { Claim, Lesson, ResearchDoc, Resource, Slide } from "./types";

type Set = (fn: (l: Lesson) => Lesson) => void;

/** About how many slides for a class of this length. */
export const slideCount = (minutes?: number) => (!minutes ? 12 : minutes <= 50 ? 12 : minutes <= 75 ? 16 : 22);

export async function runResearch(l: Lesson, course: string, set: Set): Promise<ResearchDoc> {
  const key = `research:${l.id}`;
  // Her stored textbooks: the pages that best match the topic go along as a source.
  const books = load<Resource[]>("pine.resources", []);
  const excerpts = await textbookExcerpts(`${l.topic} ${l.premise}`, books).catch(() => []);
  const r = await api<ResearchDoc>("/api/research", { method: "POST", body: JSON.stringify({ topic: l.topic, premise: l.premise, course, minutes: l.minutes, excerpts, jobKey: key }) });
  set((x) => withResearch(x, r));
  forget(key);
  return r;
}

export async function runSlides(l: Lesson, course: string, set: Set, count = slideCount(l.minutes)): Promise<Slide[]> {
  const key = `slides:${l.id}`;
  const r = await api<{ slides: Slide[] }>("/api/slides", {
    method: "POST",
    body: JSON.stringify({ course, number: l.number, topic: l.topic, premise: l.premise, minutes: l.minutes, doc: l.research, count, jobKey: key }),
  });
  set((x) => withSlides(x, r.slides));
  forget(key);
  return r.slides;
}

/** Fact-check slides that changed since their last check (or all of them). */
export async function runCheck(l: Lesson, set: Set, all = false): Promise<void> {
  const targets = l.slides.filter((s) => all || !s.check);
  const ids = targets.map((t) => t.id);
  const items = checkItems(targets);
  const at = new Date().toISOString();
  if (!items.length) return set((x) => withCheck(x, { claims: [], at }, ids));
  const key = `check:${l.id}`;
  const res = await api<{ claims: Claim[]; at: string; checked?: string[] }>("/api/check", { method: "POST", body: JSON.stringify({ items, jobKey: key }) });
  const done = new Set(res.checked ?? ids);
  // Only mark slides that haven't been edited again while the check ran.
  const sent = new Map(targets.map((t) => [t.id, JSON.stringify([t.title, t.body, t.notes])]));
  set((x) => {
    const still = ids.filter((id) => done.has(id)).filter((id) => {
      const s = x.slides.find((y) => y.id === id);
      return s && sent.get(id) === JSON.stringify([s.title, s.body, s.notes]);
    });
    return withCheck(x, res, still);
  });
  forget(key);
}

/** One click: research → slides (with the matched exhibits) → fact-check. */
export async function makeClass(l: Lesson, course: string, set: Set, stage: (s: string) => void) {
  stage("researching");
  const research = await runResearch(l, course, set);
  stage("making slides");
  const slides = await runSlides({ ...l, research }, course, set);
  stage("fact-checking");
  await runCheck({ ...l, research, slides }, set, true);
}
