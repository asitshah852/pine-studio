"use client";
// Classes: courses, each with its classes by number and topic. Open a class to work on it or,
// download the PowerPoint or the research document, or send it back to Prep.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCollection } from "@/lib/client";
import { downloadDocx } from "@/lib/docx";
import { caption } from "@/lib/museum";
import { downloadPptx } from "@/lib/pptx";
import { deckSources } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import { OTHER, pad, useStudio } from "@/lib/studio";
import { ACCEPT } from "@/lib/importers";
import { uid } from "@/lib/client";
import type { Lesson, Resource } from "@/lib/types";
import { importAll } from "./Improve";
import Renamable from "./Renamable";
import Inline from "./Inline";
import Working from "./Working";
import QuizBox from "./QuizBox";
import Planner, { QueueControls } from "./Planner";
import SlideView from "./SlideView";

function ClassPage({ lesson, course, back }: { lesson: Lesson; course: string; back: () => void }) {
  const { updateLessons } = useStudio();
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [tab, setTab] = useState<"slides" | "document" | "materials" | "sources">("slides");
  const setLesson = (fn: (l: Lesson) => Lesson) => updateLessons((cur) => cur.map((l) => (l.id === lesson.id ? fn(l) : l)));
  const [busy, setBusy] = useState(false);
  const doc = lesson.research;
  const src = deckSources(lesson.slides);
  const reads = resources.filter((x) => lesson.readings.includes(x.id));

  return (
    <main className="page">
      <button className="btn ghost sm" onClick={back}>← All classes</button>
      <div className="head" style={{ marginTop: 18 }}>
        <div>
          <div className="mono mute">{course} · Class {pad(lesson.number)}{lesson.example ? " · example" : ""}</div>
          <h1 style={{ marginTop: 6 }}><Inline value={lesson.topic} onSave={(topic) => setLesson((l) => ({ ...l, topic }))} placeholder="Class title" /></h1>
          <p><Inline multiline value={lesson.premise} onSave={(premise) => setLesson((l) => ({ ...l, premise }))} placeholder="Click to add a short summary of this class" /></p>
        </div>
        <div className="row">
          <button className="btn" disabled={busy || !lesson.slides.length} onClick={async () => { setBusy(true); try { await downloadPptx(lesson); } finally { setBusy(false); } }}>{busy ? "Building…" : "PowerPoint ↓"}</button>
          {doc && <button className="btn" onClick={() => downloadDocx(lesson, course)}>notes ↓</button>}
          <a className="btn" href={`/handout/${lesson.id}`} target="_blank" rel="noreferrer">Handout ↓</a>
          <Link className="btn ghost" href={`/prep?lesson=${lesson.id}&improve=1`}>suggest improvements</Link>
          <Link className="btn ghost" href={`/prep?lesson=${lesson.id}`}>edit</Link>
          <button className="btn ghost" onClick={() => { if (confirm(`Delete Class ${lesson.number}: ${lesson.topic}? This removes its research and slides.`)) { updateLessons((cur) => cur.filter((l) => l.id !== lesson.id)); back(); } }}>Delete</button>
        </div>
      </div>
      <QuizBox lesson={lesson} course={course} set={setLesson} />
      <nav className="steps" style={{ marginBottom: 22 }}>
        {(["slides", "document", ...((lesson.materials?.length ?? 0) ? (["materials"] as const) : []), "sources"] as const).map((t) => (
          <button key={t} className="stepb" aria-current={tab === t ? "step" : undefined} onClick={() => setTab(t)}>
            {t === "slides" ? `Slides · ${lesson.slides.length}` : t === "document" ? "Notes" : t === "materials" ? `Your materials · ${lesson.materials?.length ?? 0}` : "Sources & readings"}
          </button>
        ))}
      </nav>
      {tab === "materials" && (
        <div className="list">
          {(lesson.materials ?? []).map((m) => (
            <div key={m.id}><b style={{ fontWeight: 500 }}>{m.name}</b><p className="mute" style={{ margin: "4px 0 0" }}>{m.preview.slice(0, 280)}{m.preview.length > 280 ? "…" : ""}</p></div>
          ))}
        </div>
      )}

      {tab === "slides" &&
        (lesson.slides.length ? (
          <div className="list">
            {lesson.slides.map((s, i) => (
              <div key={s.id} className="item" style={{ gridTemplateColumns: "minmax(220px, 380px) 1fr" }}>
                <SlideView s={s} n={lesson.number} />
                <div>
                  <div className="mono mute">{pad(i + 1)}</div>
                  <h3 style={{ fontSize: 17, fontWeight: 500 }}>{s.title || "Untitled"}</h3>
                  {s.notes.trim() ? (
                    <><div className="mono mute small" style={{ marginTop: 6 }}>talking points</div><p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{s.notes}</p></>
                  ) : <p className="mute" style={{ margin: "6px 0 0" }}>No talking points yet.</p>}
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
                <h3 className="h">Pictures & videos</h3>
                {doc.exhibits.filter((e) => e.match).map((e) => (
                  <div key={e.id} className="src" style={{ marginBottom: 6 }}><a href={e.match!.url} target="_blank" rel="noreferrer">{caption(e.match!)}</a>{e.why && ` — ${e.why}`}</div>
                ))}
              </section>
            )}
          </article>
        ) : <div className="empty">No notes for this class yet. <Link href={`/prep?lesson=${lesson.id}&step=2`}>Write them →</Link></div>)}

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
  const [existing, setExisting] = useState<string | null>(null); // course id with the "existing class" form open
  const [dragL, setDragL] = useState<string | null>(null);
  const [overL, setOverL] = useState<string | null>(null);
  const [copyFor, setCopyFor] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState<string | null>(null);

  // Drag a class to a new place in its course; classes are renumbered 1, 2, 3… in the new order.
  function dropClass(targetId: string) {
    const from = dragL;
    setDragL(null);
    setOverL(null);
    if (!from || from === targetId) return;
    updateLessons((cur) => {
      const a = cur.find((x) => x.id === from);
      const b = cur.find((x) => x.id === targetId);
      if (!a || !b || a.courseId !== b.courseId) return cur;
      const inCourse = cur.filter((x) => x.courseId === a.courseId).sort((x, y) => x.number - y.number);
      const without = inCourse.filter((x) => x.id !== from);
      const at = without.findIndex((x) => x.id === targetId);
      const fromIdx = inCourse.findIndex((x) => x.id === from);
      const toIdx = inCourse.findIndex((x) => x.id === targetId);
      without.splice(fromIdx < toIdx ? at + 1 : at, 0, a);
      const num = new Map(without.map((x, i) => [x.id, i + 1]));
      return cur.map((x) => (num.has(x.id) && num.get(x.id) !== x.number ? { ...x, number: num.get(x.id)! } : x));
    });
  }

  // Copy a class (slides, research, materials) into another course as its next class, in prep.
  function copyTo(lessonId: string, courseId: string) {
    setCopyFor(null);
    updateLessons((cur) => {
      const src = cur.find((x) => x.id === lessonId);
      if (!src) return cur;
      const n = Math.max(0, ...cur.filter((x) => x.courseId === courseId).map((x) => x.number)) + 1;
      const copy = { ...src, id: uid(), courseId, number: n, status: "draft" as const, readyAt: undefined, chat: [], versions: [], example: false, slides: src.slides.map((sl) => ({ ...sl, id: uid() })) };
      return [...cur, copy];
    });
  }
  const [ex, setEx] = useState<{ number: number; topic: string; files: File[] }>({ number: 1, topic: "", files: [] });
  const [progress, setProgress] = useState("");
  const [exErr, setExErr] = useState("");

  async function addExisting(courseId: string) {
    setExErr("");
    const r = await importAll(ex.files, setProgress);
    setProgress("");
    if (r.errors.length && !r.slides.length && !r.materials.length) return setExErr(r.errors.join(" "));
    const firstTitle = r.slides.find((x) => x.title)?.title ?? "";
    const l = {
      id: uid(),
      courseId,
      number: ex.number,
      topic: ex.topic.trim() || firstTitle || ex.files[0]?.name.replace(/\.[^.]+$/, "") || "Untitled class",
      premise: "",
      readings: [],
      slides: r.slides,
      materials: r.materials,
      status: "ready" as const,
      readyAt: new Date().toISOString(),
    };
    updateLessons((cur) => [...cur, l]);
    if (r.errors.length) alert(r.errors.join("\n"));
    setExisting(null);
    setEx({ number: 1, topic: "", files: [] });
    setOpen(l.id);
    router.replace(`/classes?open=${l.id}`);
  }

  useEffect(() => {
    setOpen(params.get("open"));
  }, [params]);

  useEffect(() => {
    const l = lessons.find((x) => x.id === open);
    if (l && l.status !== "ready") router.replace(`/prep?lesson=${l.id}`);
  }, [open, lessons, router]);
  // One place per class: a class still being made opens in its workspace; a finished one opens here.
  const openClass = (l: Lesson) => (l.status === "ready" ? (setOpen(l.id), router.replace(`/classes?open=${l.id}`)) : router.push(`/prep?lesson=${l.id}`));
  const lesson = lessons.find((l) => l.id === open);
  if (lesson && lesson.status !== "ready") return <main className="page"><p className="mute">Opening…</p></main>;
  if (lesson) return <ClassPage lesson={lesson} course={courseName(lesson.courseId)} back={() => { setOpen(null); router.replace(`/classes?course=${lesson.courseId}`); }} />;
  // A course chosen in the left-hand menu: show just that course and its classes.
  const only = courses.find((c) => c.id === params.get("course"));
  const shown = only ? [only] : courses;
  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  return (
    <main className="page">
      <div className="head">
        {only ? (
          <div>
            <Link className="linkish mute" href="/classes">← all courses</Link>
          </div>
        ) : (
          <div>
            <h1>Classes</h1>
            <p className="mute">Pick a course in the menu to see just that one.</p>
          </div>
        )}
        {!only && (
          <div className="row">
            <button className="btn solid" onClick={() => setAdding(true)}>+ new course</button>
          </div>
        )}
      </div>

      {only && <QueueControls courseId={only.id} />}
      {adding && (
        <form className="card row" style={{ marginBottom: 28, maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; const id = Math.random().toString(36).slice(2, 10); updateCourses((cur) => [...cur, { id, name: name.trim() }]); setName(""); setAdding(false); router.push(`/classes?course=${id}`); }}>
          <input className="input grow" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name, e.g. Art Appreciation 103" />
          <button className="btn solid">Add</button>
          <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      )}

      {shown.map((c) => {
        const ls = lessons.filter((l) => l.courseId === c.id).sort((a, b) => a.number - b.number);
        if (c.id === OTHER && !ls.length) return null;
        return (
          <section key={c.id} id={`c-${c.id}`} className="course">
            <div className="coursehead">
              <h2>{c.id === OTHER ? c.name : <Renamable value={c.name} onSave={(name) => updateCourses((cur) => cur.map((x) => (x.id === c.id ? { ...x, name, example: false } : x)))} />}</h2>
              <div className="row">
                <span className="mono mute">{ls.length} class{ls.length === 1 ? "" : "es"}</span>
                {c.id !== OTHER && (
                  <>
                    <button className="btn sm ghost" onClick={() => {
                      if (!confirm(ls.length ? `Delete “${c.name}” and its ${ls.length} class(es)?` : `Delete “${c.name}”?`)) return;
                      updateLessons((cur) => cur.filter((l) => l.courseId !== c.id));
                      updateCourses((cur) => cur.filter((x) => x.id !== c.id));
                    }}>Delete</button>
                    <button className="btn sm" onClick={() => { setExisting(existing === c.id ? null : c.id); setEx({ number: Math.max(0, ...ls.map((l) => l.number)) + 1, topic: "", files: [] }); }}>+ existing class</button>
                    <Link className="btn sm" href={`/prep?new=1&course=${c.id}`}>+ new class</Link>
                    <button className="btn sm" onClick={() => setPlanFor(planFor === c.id ? null : c.id)}>plan the semester</button>
                  </>
                )}
              </div>
            </div>
            {planFor === c.id && <Planner course={c} close={() => setPlanFor(null)} />}
            {existing === c.id && (
              <form className="existing" onSubmit={(e) => { e.preventDefault(); if (ex.files.length) addExisting(c.id); }}>
                <p className="mute" style={{ margin: 0 }}>Bring in a class you’ve already taught. PowerPoint slides come in as editable slides (with speaker notes and pictures); PDFs and Word files are kept as class materials.</p>
                <div className="row" style={{ alignItems: "end" }}>
                  <div style={{ width: 90 }}><label className="label">class #</label><input className="input" type="number" min={1} value={ex.number} onChange={(e) => setEx({ ...ex, number: Number(e.target.value) || 1 })} /></div>
                  <div className="grow"><label className="label">topic (or leave blank to use the first slide’s title)</label><input className="input" value={ex.topic} onChange={(e) => setEx({ ...ex, topic: e.target.value })} /></div>
                </div>
                <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setEx({ ...ex, files: [...ex.files, ...Array.from(e.dataTransfer.files)] }); }}>
                  <input type="file" multiple accept={ACCEPT} className="hide" onChange={(e) => setEx({ ...ex, files: [...ex.files, ...Array.from(e.target.files ?? [])] })} />
                  {ex.files.length ? ex.files.map((f) => f.name).join(" · ") : "Drop your files here — PowerPoint (.pptx), PDF, Word (.docx), images — or click to choose"}
                </label>
                {progress && <Working what="Bringing in your class" doing={progress} usual="a few seconds per file" />}
                {exErr && <div className="err">{exErr}</div>}
                <div className="row">
                  <button className="btn solid" disabled={!ex.files.length || !!progress}>{progress || "add class"}</button>
                  <button type="button" className="btn ghost" onClick={() => setExisting(null)}>cancel</button>
                </div>
              </form>
            )}
            {ls.length ? (
              <div className="classrows">
                {ls.map((l) => (
                  <div key={l.id} className={`classrow ${dragL === l.id ? "dragging" : ""} ${overL === l.id && dragL !== l.id ? "over" : ""}`} role="link" tabIndex={0}
                    draggable
                    onDragStart={(e) => { setDragL(l.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pine-class", l.id); }}
                    onDragOver={(e) => { if (dragL && ls.some((x) => x.id === dragL)) { e.preventDefault(); setOverL(l.id); } }}
                    onDragLeave={() => setOverL((o) => (o === l.id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); dropClass(l.id); }}
                    onDragEnd={() => { setDragL(null); setOverL(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") openClass(l); }} onClick={() => openClass(l)}>
                    <span className="num serif">{pad(l.number)}</span>
                    <span className="thumb">{l.slides[0] ? <SlideView s={l.slides[0]} n={l.number} /> : <span className="slide"><span className="ph">no slides</span></span>}</span>
                    <span className="grow">
                      <Renamable className="t" value={l.topic} onSave={(topic) => updateLessons((cur) => cur.map((x) => (x.id === l.id ? { ...x, topic } : x)))} />
                      {l.premise && <span className="src" style={{ display: "block" }}>{l.premise}</span>}
                    </span>
                    <span className="mono mute meta">
                      <span className={`v ${l.status === "ready" ? "ok" : "todo"}`}>{l.status === "ready" ? "ready" : "in prep"}</span>
                      <span>{l.slides.length} slides{l.research ? " · doc" : ""}{l.materials?.length ? ` · ${l.materials.length} file(s)` : ""}</span>
                      <span className="row" style={{ gap: 14 }} onClick={(e) => e.stopPropagation()}>
                        {copyFor === l.id ? (
                          <select className="select" autoFocus style={{ width: "auto", fontSize: 16, padding: "2px 0" }} defaultValue="" onBlur={() => setCopyFor(null)} onChange={(e) => e.target.value && copyTo(l.id, e.target.value)} aria-label="Copy to course">
                            <option value="" disabled>copy to…</option>
                            {courses.filter((k) => k.id !== OTHER).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                          </select>
                        ) : (
                          <button className="btn sm ghost" onClick={() => setCopyFor(l.id)}>copy to…</button>
                        )}
                        <Link className="btn sm" href={`/prep?lesson=${l.id}&improve=1`}>suggest improvements</Link>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty">No classes yet — <Link href={`/prep?new=1&course=${c.id}`}>add one</Link>, or plan the whole semester.</div>}
          </section>
        );
      })}
    </main>
  );
}
