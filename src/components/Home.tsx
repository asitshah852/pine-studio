"use client";
// Home: what to do next. Her next class to prepare, where it stands, and one button for the next step.
import Link from "next/link";
import { useJob } from "@/lib/jobs";
import { readiness } from "@/lib/slides";
import { pad, useStudio } from "@/lib/studio";
import type { Lesson } from "@/lib/types";
import SlideView from "./SlideView";

function next(l: Lesson): { label: string; href: string } {
  const r = readiness(l);
  if (l.status === "ready") return { label: "open it", href: `/classes?open=${l.id}` };
  if (!l.research && !l.slides.length) return { label: "make my class", href: `/prep?lesson=${l.id}&make=1` };
  if (!l.slides.length) return { label: "make the slides", href: `/prep?lesson=${l.id}&step=3` };
  if (r.problems || r.unchecked) return { label: r.problems ? `fix ${r.problems} slide(s)` : "finish checking", href: `/prep?lesson=${l.id}&step=4` };
  return { label: "mark it ready for class", href: `/prep?lesson=${l.id}&step=4` };
}

/** Where a class stands, in a few words. */
function where(l: Lesson): string {
  const r = readiness(l);
  const n = `${l.slides.length} slide${l.slides.length === 1 ? "" : "s"}`;
  if (l.status === "ready") return "ready for class";
  if (!l.research && !l.slides.length) return "not started";
  if (!l.slides.length) return "researched · no slides yet";
  if (r.problems) return `${n} · ${r.problems} to fix`;
  if (r.unchecked) return `${n} · not all checked`;
  return `${n} · not marked ready`;
}

export default function Home() {
  const { ready, courses, lessons } = useStudio();
  const order = new Map(courses.map((c, i) => [c.id, i]));
  const sorted = [...lessons].sort((a, b) => (order.get(a.courseId) ?? 99) - (order.get(b.courseId) ?? 99) || a.number - b.number);
  const drafts = sorted.filter((l) => l.status === "draft" && !l.example);
  const top = drafts[0];
  const makeJob = useJob(`make:${top?.id ?? "none"}`);
  const courseName = (id: string) => courses.find((c) => c.id === id)?.name ?? "";
  const n = top ? next(top) : null;

  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  // the rest of what's in prep, folded away by course
  const byCourse = courses.map((c) => ({ c, ls: drafts.slice(1).filter((l) => l.courseId === c.id) })).filter((g) => g.ls.length);

  return (
    <main className="page home">
      <div className="mono mute">next up</div>
      {top ? (
        <section className="nextup">
          <div className="nextup-main">
            <div className="mono mute">{courseName(top.courseId)} · class {pad(top.number)}</div>
            <h1 className="serif">{top.topic}</h1>
            <p className="mute" style={{ margin: "0 0 18px" }}>{makeJob.running ? `being made now — ${makeJob.stage || "starting"}…` : where(top)}</p>
            <div className="row">
              {!makeJob.running && <Link className="btn solid" href={n!.href}>{n!.label} →</Link>}
              <Link className="linkish" href={`/prep?lesson=${top.id}`}>open in prep</Link>
            </div>
          </div>
          {top.slides[0] && <div className="nextup-slide"><SlideView s={top.slides[0]} n={top.number} /></div>}
        </section>
      ) : (
        <section className="nextup">
          <div className="nextup-main">
            <h1 className="serif">All your classes are ready.</h1>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn solid" href="/prep?new=1">prepare a new class →</Link>
            </div>
          </div>
        </section>
      )}

      {byCourse.length > 0 && (
        <details className="fold">
          <summary>also in prep <span className="mute">({drafts.length - 1})</span></summary>
          {byCourse.map(({ c, ls }) => (
            <details key={c.id} className="fold inner" open={byCourse.length === 1}>
              <summary>{c.name} <span className="mute">({ls.length})</span></summary>
              <ul className="foldlist">
                {ls.map((l) => (
                  <li key={l.id}>
                    <Link href={`/prep?lesson=${l.id}`}><span className="mute">{pad(l.number)}</span> {l.topic}</Link>
                    <span className="mute">{where(l)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </details>
      )}
    </main>
  );
}
