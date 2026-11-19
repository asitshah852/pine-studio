"use client";
// Courses + classes together, with older saved classes upgraded on the fly.
import { useMemo } from "react";
import { useCollection } from "./client";
import { SEED_COURSES, SEED_LESSONS } from "./seed";
import type { Course, Lesson } from "./types";

export const OTHER = "__other";

export function upgrade(l: Lesson): Lesson {
  const deck = (l.materials ?? []).some((m) => m.kind === "pptx");
  const slides = (l.slides ?? []).map((s) =>
    s.notes && !s.fromDeck && !deck ? { ...s, body: s.body.trim() ? s.body : s.notes, notes: "" } : s,
  );
  return {
    ...l,
    slides,
    courseId: l.courseId || (l.id.startsWith("example-") ? "course-example" : OTHER), premise: l.premise ?? l.summary ?? "", readings: l.readings ?? [] };
}

export function useStudio() {
  const c = useCollection<Course>("courses", SEED_COURSES);
  const l = useCollection<Lesson>("lessons", SEED_LESSONS);
  const lessons = useMemo(() => l.items.map(upgrade), [l.items]);
  const courses = useMemo(() => {
    const list = [...c.items];
    if (lessons.some((x) => !list.some((k) => k.id === x.courseId))) list.push({ id: OTHER, name: "Other classes" });
    return list;
  }, [c.items, lessons]);
  return {
    ready: c.ready && l.ready,
    courses,
    lessons,
    updateCourses: c.update,
    updateLessons: (fn: (cur: Lesson[]) => Lesson[]) => l.update((cur) => fn(cur.map(upgrade))),
    courseName: (id: string) => courses.find((k) => k.id === id)?.name ?? "",
  };
}

export const pad = (n: number) => String(n).padStart(2, "0");
