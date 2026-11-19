"use client";
// Home: what to do next. Her next class to prepare, where it stands, and one button for the next step.
import Link from "next/link";
import { useJob } from "@/lib/jobs";
import { readiness } from "@/lib/slides";
import { OTHER, pad, useStudio } from "@/lib/studio";
import type { Lesson } from "@/lib/types";
import SlideView from "./SlideView";

function next(l: Lesson): { label: string; href: string } {
  const r = readiness(l);
  if (l.status === "ready") return { label: "present it", href: `/classes?open=${l.id}` };
  if (!l.research && !l.slides.length) return { label: "make my class", href: `/prep?lesson=${l.id}&make=1` };
  if (!l.slides.length) return { label: "make the slides", href: `/prep?lesson=${l.id}&step=3` };
  if (r.problems || r.unchecked) return { label: r.problems ? `fix ${r.problems} slide(s)` : "finish checking", href: `/prep?lesson=${l.id}&step=4` };
  return { label: "mark it ready for class", href: `/prep?lesson=${l.id}&step=4` };
}

function Status({ l }: { l: Lesson }) {
  const r = readiness(l);
  const cells: [string, boolean, string][] = [
    ["brief", true, ""],
    ["research", !!l.research, l.research ? "" : "to do"],
    ["slides", l.slides.length > 0, l.slides.length ? `${l.slides.length}` : "to do"],
    ["fact-checked", l.slides.length > 0 && !r.unchecked && !r.problems, r.problems ? `${r.problems} to fix` : r.unchecked ? `${r.unchecked} to check` : ""],
    ["ready", l.status === "ready", ""],
  ];
  return (
    <div className="statusrow">
      {cells.map(([k, done, note]) => (
        <span key={k} className={done ? "done" : ""}>
          <span className="mark">{done ? "✓" : "○"}</span> {k}
          {note && <span className="mute"> · {note}</span>}
        </span>
      ))}
    </div>
  );
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

  return (
    <main className="page">
      <div className="mono mute">next up</div>
      {top ? (
        <section className="nextup">
          <div className="nextup-main">
            <div className="mono mute">{courseName(top.courseId)} · class {pad(top.number)}</div>
            <h1 className="serif">{top.topic}</h1>
            {top.premise && <p className="lead mute">{top.premise}</p>}
            <Status l={top} />
            <div className="row" style={{ marginTop: 18 }}>
              {makeJob.running ? <span className="mute">Being made now — {makeJob.stage || "starting"}…</span> : <Link className="btn solid" href={n!.href}>{n!.label} →</Link>}
              <Link className="btn ghost" href={`/prep?lesson=${top.id}`}>open in prep</Link>
            </div>
          </div>
          <div className="nextup-slide">{top.slides[0] ? <SlideView s={top.slides[0]} n={top.number} /> : <div className="slide"><div className="ph">no slides yet</div></div>}</div>
        </section>
      ) : (
        <section className="nextup">
          <div className="nextup-main">
            <h1 className="serif">All your classes are ready.</h1>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn solid" href="/prep?new=1">prepare a new class →</Link>
              <Link className="btn ghost" href="/classes">see your classes</Link>
            </div>
          </div>
        </section>
      )}

      {drafts.length > 1 && (
        <section style={{ marginTop: 46 }}>
          <div className="mono mute" style={{ marginBottom: 8 }}>also in prep</div>
          <div className="list">
            {drafts.slice(1).map((l) => {
              const x = next(l);
              return (
                <div key={l.id} className="item" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div>
                    <div className="mono mute">{courseName(l.courseId)} · class {pad(l.number)}</div>
                    <h3>{l.topic}</h3>
                    <Status l={l} />
                  </div>
                  <Link className="btn" href={x.href}>{x.label} →</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ marginTop: 46 }}>
        <div className="mono mute" style={{ marginBottom: 8 }}>your courses</div>
        <div className="row" style={{ gap: 26 }}>
          {courses.filter((c) => c.id !== OTHER).map((c) => {
            const ls = lessons.filter((l) => l.courseId === c.id);
            return (
              <Link key={c.id} href={`/classes#c-${c.id}`} className="coursecard">
                <span className="serif">{c.name}</span>
                <span className="mute">{ls.filter((l) => l.status === "ready").length} ready · {ls.filter((l) => l.status === "draft").length} in prep</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
