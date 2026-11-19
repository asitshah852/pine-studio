"use client";
// Classes: courses, each with its classes by number and topic. Open a class to present it,
// download the PowerPoint or the research document, or send it back to Prep.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCollection } from "@/lib/client";
import { downloadDocx } from "@/lib/docx";
import { caption } from "@/lib/museum";
import { downloadPptx } from "@/lib/pptx";
import { deckSources, readiness } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import { OTHER, pad, useStudio } from "@/lib/studio";
import type { Lesson, Resource } from "@/lib/types";
import SlideView from "./SlideView";

function Present({ lesson, close }: { lesson: Lesson; close: () => void }) {
  const [i, setI] = useState(0);
  const n = lesson.slides.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) setI((x) => Math.min(n - 1, x + 1));
      if (["ArrowLeft", "PageUp"].includes(e.key)) setI((x) => Math.max(0, x - 1));
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", k);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener("keydown", k);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);
  return (
    <div className="present" onClick={() => setI((x) => Math.min(n - 1, x + 1))}>
      <SlideView s={lesson.slides[i]} n={lesson.number} />
      <div className="pnav mono" onClick={(e) => e.stopPropagation()}>
        <button className="btn sm" onClick={() => setI(Math.max(0, i - 1))}>←</button>
        <span>{i + 1} / {n}</span>
        <button className="btn sm" onClick={() => setI(Math.min(n - 1, i + 1))}>→</button>
        <button className="btn sm" onClick={close}>Esc</button>
      </div>
    </div>
  );
}

function ClassPage({ lesson, course, back }: { lesson: Lesson; course: string; back: () => void }) {
  const { updateLessons } = useStudio();
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [tab, setTab] = useState<"slides" | "document" | "sources">("slides");
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = readiness(lesson);
  const doc = lesson.research;
  const src = deckSources(lesson.slides);
  const reads = resources.filter((x) => lesson.readings.includes(x.id));

  return (
    <main className="page">
      {presenting && <Present lesson={lesson} close={() => setPresenting(false)} />}
      <button className="btn ghost sm" onClick={back}>← All classes</button>
      <div className="head" style={{ marginTop: 18 }}>
        <div>
          <div className="mono mute">{course} · Class {pad(lesson.number)}{lesson.example ? " · example" : ""}</div>
          <h1 style={{ marginTop: 6 }}>{lesson.topic}</h1>
          {lesson.premise && <p>{lesson.premise}</p>}
        </div>
        <div className="row">
          <button className="btn solid" onClick={() => setPresenting(true)} disabled={!lesson.slides.length}>Present</button>
          <button className="btn" disabled={busy || !lesson.slides.length} onClick={async () => { setBusy(true); try { await downloadPptx(lesson); } finally { setBusy(false); } }}>{busy ? "Building…" : "PowerPoint ↓"}</button>
          {doc && <button className="btn" onClick={() => downloadDocx(lesson, course)}>Document ↓</button>}
          <Link className="btn ghost" href={`/prep?lesson=${lesson.id}`}>Edit in Prep</Link>
          <button className="btn ghost" onClick={() => { if (confirm(`Delete Class ${lesson.number}: ${lesson.topic}? This removes its research and slides.`)) { updateLessons((cur) => cur.filter((l) => l.id !== lesson.id)); back(); } }}>Delete</button>
        </div>
      </div>
      <div className="row mono" style={{ marginBottom: 18, gap: 18 }}>
        <span className={`v ${lesson.status === "ready" ? "ok" : "todo"}`}>{lesson.status === "ready" ? "ready for class" : "in prep"}</span>
        <span className={`v ${r.problems ? "bad" : r.unchecked ? "todo" : r.unverified ? "unv" : "ok"}`}>
          {r.problems ? `${r.problems} slide(s) with errors` : r.unchecked ? `${r.unchecked} slide(s) not checked` : r.unverified ? `${r.unverified} slide(s) unverified` : "fact-checked"}
        </span>
        {r.rights > 0 && <span className="mute">{r.rights} image(s): rights to check</span>}
      </div>

      <nav className="steps" style={{ marginBottom: 22 }}>
        {(["slides", "document", "sources"] as const).map((t) => (
          <button key={t} className="stepb" aria-current={tab === t ? "step" : undefined} onClick={() => setTab(t)}>
            {t === "slides" ? `Slides · ${lesson.slides.length}` : t === "document" ? "Research document" : "Sources & readings"}
          </button>
        ))}
      </nav>

      {tab === "slides" &&
        (lesson.slides.length ? (
          <div className="list">
            {lesson.slides.map((s, i) => (
              <div key={s.id} className="item" style={{ gridTemplateColumns: "minmax(220px, 380px) 1fr" }}>
                <SlideView s={s} n={lesson.number} />
                <div>
                  <div className="mono mute">{pad(i + 1)}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 500 }}>{s.title || "Untitled"}</h3>
                  {s.notes ? <p style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{s.notes}</p> : <p className="mute" style={{ margin: "6px 0 0" }}>No speaker notes.</p>}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="empty">No slides yet. <Link href={`/prep?lesson=${lesson.id}`}>Make them in Prep →</Link></div>)}

      {tab === "document" &&
        (doc ? (
          <article className="card doc read">
            {doc.overview && <p className="lead">{doc.overview}</p>}
            {doc.sections.map((s) => (
              <section key={s.id}>
                <h3 className="h">{s.heading}</h3>
                {s.paragraphs.map((p) => (
                  <div key={p.id} className="para">
                    <p>{p.text} <span className={`v ${p.edited ? "todo" : p.verified ? "ok" : "unv"}`} /></p>
                    <div className="src">{p.sources.map((x, i) => <span key={i}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></span>)}</div>
                  </div>
                ))}
              </section>
            ))}
            {doc.questions.length > 0 && (
              <section>
                <h3 className="h">Discussion questions</h3>
                <ol>{doc.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
              </section>
            )}
            {doc.exhibits.some((e) => e.match) && (
              <section>
                <h3 className="h">Exhibits</h3>
                {doc.exhibits.filter((e) => e.match).map((e) => (
                  <div key={e.id} className="src" style={{ marginBottom: 6 }}><a href={e.match!.url} target="_blank" rel="noreferrer">{caption(e.match!)}</a>{e.why && ` — ${e.why}`}</div>
                ))}
              </section>
            )}
          </article>
        ) : <div className="empty">No research document for this class. <Link href={`/prep?lesson=${lesson.id}`}>Research it in Prep →</Link></div>)}

      {tab === "sources" && (
        <div className="row" style={{ alignItems: "start", gap: 36 }}>
          <section className="grow">
            <h2>Readings</h2>
            {reads.length ? reads.map((x) => <div key={x.id} className="src">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title} {x.author && `— ${x.author}`}</div>) : <p className="mute">None assigned (Prep → Slides → Library).</p>}
          </section>
          <section className="grow">
            <h2>Slide sources</h2>
            {src.length ? src.map((s) => <div key={s.url} className="src">{/^https?:/.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</div>) : <p className="mute">No sources recorded.</p>}
          </section>
        </div>
      )}
    </main>
  );
}

export default function Classes() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, courses, lessons, updateCourses, updateLessons, courseName } = useStudio();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setOpen(params.get("open"));
  }, [params]);

  const lesson = lessons.find((l) => l.id === open);
  if (lesson) return <ClassPage lesson={lesson} course={courseName(lesson.courseId)} back={() => { setOpen(null); router.replace("/classes"); }} />;
  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  return (
    <main className="page">
      <div className="head">
        <div>
          <h1>Classes</h1>
          <p>Your courses and their classes. Open a class to present it, download the slides or the research document, or edit it in Prep.</p>
        </div>
        <div className="row">
          <button className="btn ghost" onClick={() => setAdding(true)}>+ New course</button>
          <Link className="btn solid" href="/prep?new=1">+ New class</Link>
        </div>
      </div>

      {adding && (
        <form className="card row" style={{ marginBottom: 28, maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; updateCourses((cur) => [...cur, { id: Math.random().toString(36).slice(2, 10), name: name.trim() }]); setName(""); setAdding(false); }}>
          <input className="input grow" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name, e.g. Art Appreciation 103" />
          <button className="btn solid">Add</button>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}

      {courses.map((c) => {
        const ls = lessons.filter((l) => l.courseId === c.id).sort((a, b) => a.number - b.number);
        if (c.id === OTHER && !ls.length) return null;
        return (
          <section key={c.id} id={`c-${c.id}`} className="course">
            <div className="coursehead">
              <h2>{c.name}</h2>
              <div className="row">
                <span className="mono mute">{ls.length} class{ls.length === 1 ? "" : "es"}</span>
                {c.id !== OTHER && (
                  <>
                    <button className="btn sm ghost" onClick={() => { const n = prompt("Course name", c.name); if (n?.trim()) updateCourses((cur) => cur.map((x) => (x.id === c.id ? { ...x, name: n.trim(), example: false } : x))); }}>Rename</button>
                    <button className="btn sm ghost" onClick={() => {
                      if (!confirm(ls.length ? `Delete “${c.name}” and its ${ls.length} class(es)?` : `Delete “${c.name}”?`)) return;
                      updateLessons((cur) => cur.filter((l) => l.courseId !== c.id));
                      updateCourses((cur) => cur.filter((x) => x.id !== c.id));
                    }}>Delete</button>
                    <Link className="btn sm" href={`/prep?new=1&course=${c.id}`}>+ Class</Link>
                  </>
                )}
              </div>
            </div>
            {ls.length ? (
              <div className="classrows">
                {ls.map((l) => (
                  <button key={l.id} className="classrow" onClick={() => { setOpen(l.id); router.replace(`/classes?open=${l.id}`); }}>
                    <span className="num serif">{pad(l.number)}</span>
                    <span className="thumb">{l.slides[0] ? <SlideView s={l.slides[0]} n={l.number} /> : <span className="slide"><span className="ph">no slides</span></span>}</span>
                    <span className="grow">
                      <span className="t">{l.topic}</span>
                      {l.premise && <span className="src" style={{ display: "block" }}>{l.premise}</span>}
                    </span>
                    <span className="mono mute meta">
                      <span className={`v ${l.status === "ready" ? "ok" : "todo"}`}>{l.status === "ready" ? "ready" : "in prep"}</span>
                      <span>{l.slides.length} slides{l.research ? " · doc" : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <div className="empty">No classes yet. <Link href={`/prep?new=1&course=${c.id}`}>Prepare the first one →</Link></div>}
          </section>
        );
      })}
    </main>
  );
}
