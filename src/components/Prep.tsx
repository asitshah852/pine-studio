"use client";
// Prep: four steps. 1 Brief → 2 Research (document, questions, exhibits) → 3 Slides → 4 Check & finish.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, proxied, uid, useCollection, useStatus } from "@/lib/client";
import { downloadDocx } from "@/lib/docx";
import { MIME, readDrag, startDrag } from "@/lib/drag";
import { forget, recover, useJob } from "@/lib/jobs";
import { restore, withChat, withCheck, withResearch, withReview, withSlides } from "@/lib/lessonOps";
import { caption } from "@/lib/museum";
import { downloadPptx } from "@/lib/pptx";
import { addTo, blankSlide, checkItems, readiness, slideFrom, slideState } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import { OTHER, pad, useStudio } from "@/lib/studio";
import type { Artwork, ChatOp, Claim, Lesson, ResearchDoc, Resource, ReviewDoc, Slide, Source } from "@/lib/types";
import Claims from "./Claims";
import Improve from "./Improve";
import Working from "./Working";
import Versions from "./Versions";
import Talk from "./Talk";
import { ExhibitsPanel, FilesPanel, LibraryPanel, TextbookPanel } from "./Panels";
import SlideView from "./SlideView";

type Step = 1 | 2 | 3 | 4;
const FRAME = "application/x-pine-frame";
const stateMark = { ok: "ok", unverified: "unv", problem: "bad", unchecked: "todo" } as const;
const stateText = { ok: "checked", unverified: "unverified", problem: "fix", unchecked: "not checked" };

function Src({ sources }: { sources: { title: string; url: string }[] }) {
  if (!sources.length) return null;
  return (
    <div className="src">
      {sources.map((s, i) => (
        <span key={i}>
          {i ? " · " : ""}
          {/^https?:/.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
        </span>
      ))}
    </div>
  );
}

/* ───────── Step 1: brief ───────── */

function Brief({ lesson, preset, onSave, onNext }: { lesson: Lesson | null; preset?: string | null; onSave: (b: { courseId: string; newCourse?: string; number: number; topic: string; premise: string }) => void; onNext?: () => void }) {
  const { courses, lessons } = useStudio();
  const real = courses.filter((c) => c.id !== OTHER);
  const [courseId, setCourseId] = useState(lesson?.courseId && lesson.courseId !== OTHER ? lesson.courseId : real.find((c) => c.id === preset)?.id ?? real[0]?.id ?? "new");
  const [newCourse, setNewCourse] = useState("");
  const nextNum = (cid: string) => Math.max(0, ...lessons.filter((l) => l.courseId === cid).map((l) => l.number)) + 1;
  const [number, setNumber] = useState(lesson?.number ?? nextNum(courseId));
  const [topic, setTopic] = useState(lesson?.topic ?? "");
  const [premise, setPremise] = useState(lesson?.premise ?? "");
  const ok = topic.trim() && (courseId !== "new" || newCourse.trim());

  return (
    <form
      className="card stack"
      style={{ maxWidth: 720 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSave({ courseId, newCourse: courseId === "new" ? newCourse.trim() : undefined, number, topic: topic.trim(), premise: premise.trim() });
        onNext?.();
      }}
    >
      <div className="row" style={{ alignItems: "end" }}>
        <div className="grow">
          <label className="label mono">Course</label>
          <select className="select" value={courseId} onChange={(e) => { setCourseId(e.target.value); if (!lesson) setNumber(nextNum(e.target.value)); }}>
            {real.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="new">+ New course…</option>
          </select>
        </div>
        <div style={{ width: 100 }}>
          <label className="label mono">Class #</label>
          <input className="input" type="number" min={1} value={number} onChange={(e) => setNumber(Number(e.target.value) || 1)} />
        </div>
      </div>
      {courseId === "new" && (
        <div><label className="label mono">New course name</label><input className="input" autoFocus value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="e.g. Art Appreciation 103" /></div>
      )}
      <div><label className="label mono">Topic</label><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Impressionism and the camera" /></div>
      <div>
        <label className="label mono">Premise — what is this class about?</label>
        <textarea className="area" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="e.g. How photography changed what painters thought painting was for. Link to works students can see at the Art Institute." />
      </div>
      <div className="row">
        <button className="btn solid" disabled={!ok}>{lesson ? "Save and go to research →" : "Start this class →"}</button>
      </div>
    </form>
  );
}

/* ───────── Step 2: research document ───────── */

function ResearchStep({ lesson, course, set, onNext }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; onNext: () => void }) {
  const st = useStatus();
  const job = useJob(`research:${lesson.id}`);
  const busy = job.running;
  const err = job.error;
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const doc = lesson.research;
  const setDoc = (fn: (d: ResearchDoc) => ResearchDoc) => set((l) => (l.research ? { ...l, research: fn(l.research) } : l));

  async function run() {
    if (doc && !confirm("Replace the current research document with a new one?")) return;
    job.clearError();
    await job.run(async () => {
      const key = `research:${lesson.id}`;
      const r = await api<ResearchDoc>("/api/research", { method: "POST", body: JSON.stringify({ topic: lesson.topic, premise: lesson.premise, course, jobKey: key }) });
      set((l) => withResearch(l, r));
      forget(key);
    });
  }

  if (!doc)
    return (
      <div className="card stack" style={{ maxWidth: 720 }}>
        <h2>Research</h2>
        <p style={{ margin: 0 }}>
          Writes a 1–2 page document on <b>{lesson.topic}</b> from museum, Smarthistory and scholarly pages, with discussion questions and
          suggested exhibits looked up in the Art Institute, the Met and Cleveland. Every fact keeps its source; anything unsourced is marked “?”.
        </p>
        {lesson.premise && <p className="mute" style={{ margin: 0 }}>Premise: {lesson.premise}</p>}
        <div className="row">
          <button className="btn solid" disabled={busy || st?.claude === false} onClick={run}>{busy ? "researching…" : "research this class"}</button>
          <button className="btn ghost" onClick={onNext}>Skip — make slides by hand</button>
          <Versions lesson={lesson} kind="research" set={set} />
        </div>
        {busy && <Working since={job.started} what="Researching" doing="Searching museum, Smarthistory and scholarly pages, writing the document, then matching exhibits to museum records" usual="2–3 minutes" />}
        {st?.claude === false && <div className="note">Research is off until the Claude key is added in Vercel.</div>}
        {err && <div className="err">{err}</div>}
      </div>
    );

  const unsourced = doc.sections.flatMap((s) => s.paragraphs).filter((p) => !p.verified || p.edited).length;
  const chosen = doc.exhibits.filter((e) => e.use && e.match).length;

  return (
    <div className="bench">
      <article className="card doc">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <span className="mono mute">Research document · {doc.at.slice(0, 10)}{unsourced ? ` · ${unsourced} paragraph(s) to check` : " · all sourced"}</span>
          <div className="row">
            <Versions lesson={lesson} kind="research" set={set} />
            <button className="btn sm ghost" onClick={() => downloadDocx(lesson, course)}>Word ↓</button>
            <button className="btn sm ghost" disabled={busy} onClick={run}>{busy ? "researching…" : "redo"}</button>
            <button className="btn sm ghost" onClick={() => confirm("Delete this research document? (You can restore it from earlier versions.)") && set((l) => withResearch(l, undefined))}>Delete</button>
          </div>
        </div>
        {busy && <Working since={job.started} what="Researching again" doing="Searching museum, Smarthistory and scholarly pages, writing a new document, then matching exhibits" usual="2–3 minutes" />}
        {err && <div className="err">{err}</div>}
        <textarea className="area plain lead" value={doc.overview} onChange={(e) => setDoc((d) => ({ ...d, overview: e.target.value }))} rows={3} />
        {doc.sections.map((s) => (
          <section key={s.id}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input className="input plain h" value={s.heading} onChange={(e) => setDoc((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, heading: e.target.value } : x)) }))} />
              <button className="btn sm ghost" title="Delete section" onClick={() => confirm(`Delete the section “${s.heading}”?`) && setDoc((d) => ({ ...d, sections: d.sections.filter((x) => x.id !== s.id) }))}>×</button>
            </div>
            {s.paragraphs.map((p) => (
              <div key={p.id} className="para">
                {editing === p.id ? (
                  <textarea className="area" autoFocus value={p.text} onBlur={() => setEditing(null)}
                    onChange={(e) => setDoc((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, paragraphs: x.paragraphs.map((y) => (y.id === p.id ? { ...y, text: e.target.value, edited: true } : y)) } : x)) }))} />
                ) : (
                  <p onClick={() => setEditing(p.id)} title="Click to edit">{p.text}</p>
                )}
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", alignItems: "start" }}>
                  <div className="grow">
                    <span className={`v ${p.edited ? "todo" : p.verified ? "ok" : "unv"}`}>{p.edited ? "edited — check" : p.verified ? "sourced" : "no source"}</span>
                    <Src sources={p.sources} />
                  </div>
                  <button className="btn sm ghost" onClick={() => setDoc((d) => ({ ...d, sections: d.sections.map((x) => (x.id === s.id ? { ...x, paragraphs: x.paragraphs.filter((y) => y.id !== p.id) } : x)) }))}>Delete</button>
                </div>
              </div>
            ))}
          </section>
        ))}
        <section>
          <h3 className="h">Discussion questions</h3>
          {doc.questions.map((qq, i) => (
            <div key={i} className="row" style={{ flexWrap: "nowrap", marginBottom: 6 }}>
              <span className="mono mute">{i + 1}</span>
              <input className="input plain grow" value={qq} onChange={(e) => setDoc((d) => ({ ...d, questions: d.questions.map((x, j) => (j === i ? e.target.value : x)) }))} />
              <button className="btn sm ghost" onClick={() => setDoc((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <button className="btn sm ghost" onClick={() => setDoc((d) => ({ ...d, questions: [...d.questions, ""] }))}>+ Question</button>
        </section>
      </article>

      <aside className="stack">
        <div className="card">
          <h2 style={{ marginBottom: 4 }}>Exhibits</h2>
          <p className="mute" style={{ margin: "0 0 12px", fontSize: 16 }}>Suggested for this class and matched to the museum’s own record. Tick the ones to use in the slides.</p>
          <div className="stack">
            {doc.exhibits.map((e) => (
              <div key={e.id} className="sugg">
                {e.match ? (
                  <>
                    <div className="photo">{e.match.thumbUrl ? <img src={proxied(e.match.thumbUrl)} alt="" loading="lazy" /> : null}</div>
                    <div>
                      <label className="row" style={{ flexWrap: "nowrap", alignItems: "start", gap: 8 }}>
                        <input type="checkbox" checked={e.use} onChange={() => setDoc((d) => ({ ...d, exhibits: d.exhibits.map((x) => (x.id === e.id ? { ...x, use: !x.use } : x)) }))} />
                        <b>{e.match.title}</b>
                      </label>
                      <div className="src">{e.match.artist.split("\n")[0]}{e.match.date && `, ${e.match.date}`}</div>
                      {e.why && <div style={{ fontSize: 16, marginTop: 4 }}>{e.why}</div>}
                      <div className="src"><a href={e.match.url} target="_blank" rel="noreferrer">{e.match.museum} ↗</a> · {e.match.video ? `YouTube · ${e.match.video.channel}` : e.match.publicDomain ? "free to use" : "rights: check"}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="photo" />
                    <div>
                      <b style={{ fontWeight: 500 }}>{e.suggested}</b>
                      <div className="src">Not found in the open collections. {e.why}</div>
                      <button className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => setQ(e.suggested.replace(/\(.*?\)/g, ""))}>Search ↓</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 className="mono" style={{ fontWeight: 400 }}>Find more exhibits</h3>
          <ExhibitsPanel q={q} setQ={setQ} addLabel="+ Use"
            onAdd={(a: Artwork) => setDoc((d) => (d.exhibits.some((x) => x.match?.url === a.url) ? d : { ...d, exhibits: [...d.exhibits, { id: uid(), suggested: a.title, why: "", match: a, use: true }] }))} />
        </div>
      </aside>

      <div className="nextbar">
        <span className="mute">{chosen} exhibit(s) chosen · {doc.questions.length} questions</span>
      </div>
    </div>
  );
}

/* ───────── Step 3: slides ───────── */

function SlidesStep({ lesson, course, set, resources, onNext }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; resources: Resource[]; onNext: () => void }) {
  const st = useStatus();
  const [sel, setSel] = useState<string | null>(null);
  const [tool, setTool] = useState<"exhibits" | "textbook" | "images" | "library">("exhibits");
  const [q, setQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [count, setCount] = useState(12);
  const job = useJob(`slides:${lesson.id}`);
  const busy = job.running;
  const err = job.error;
  const slide = lesson.slides.find((s) => s.id === sel) ?? lesson.slides[0] ?? null;
  const setSlides = (fn: (s: Slide[]) => Slide[]) => set((l) => ({ ...l, slides: fn(l.slides) }));
  const setSlide = (id: string, fn: (s: Slide) => Slide) => setSlides((ss) => ss.map((s) => (s.id === id ? fn(s) : s)));
  const edit = (patch: Partial<Slide>) => slide && setSlide(slide.id, (s) => ({ ...s, ...patch, check: undefined }));
  const chosen = [...(lesson.research?.exhibits ?? []), ...(lesson.review?.exhibits ?? [])]
    .filter((e) => e.use && e.match)
    .map((e) => e.match!)
    .filter((a, i, all) => all.findIndex((b) => b.url === a.url) === i);
  const books = resources.filter((r) => r.kind === "textbook");

  async function auto() {
    if (lesson.slides.length && !confirm("Replace the current slides with new ones made from the research?")) return;
    job.clearError();
    await job.run(async () => {
      const key = `slides:${lesson.id}`;
      const r = await api<{ slides: Slide[] }>("/api/slides", { method: "POST", body: JSON.stringify({ course, number: lesson.number, topic: lesson.topic, premise: lesson.premise, doc: lesson.research, count, jobKey: key }) });
      set((l) => withSlides(l, r.slides));
      forget(key);
      setSel(r.slides[0]?.id ?? null);
    });
  }

  function dropOnStrip(e: React.DragEvent, at?: number) {
    e.preventDefault();
    setOver(null);
    const from = e.dataTransfer.getData(FRAME);
    if (from) {
      setSlides((ss) => {
        const i = ss.findIndex((s) => s.id === from);
        if (i < 0) return ss;
        const next = [...ss];
        const [m] = next.splice(i, 1);
        next.splice(at ?? next.length, 0, m);
        return next;
      });
      return;
    }
    const item = readDrag(e);
    if (!item) return;
    const s = slideFrom(item);
    setSlides((ss) => { const n = [...ss]; n.splice(at ?? n.length, 0, s); return n; });
    setSel(s.id);
  }
  const addArt = (a: Artwork) => { if (slide) setSlide(slide.id, (s) => addTo(s, { kind: "artwork", artwork: a })); else { const s = slideFrom({ kind: "artwork", artwork: a }); setSlides((x) => [...x, s]); setSel(s.id); } };

  const maker = (
    <div className="row" style={{ gap: 8 }}>
      {lesson.research ? (
        <>
          <select className="select" style={{ width: "auto" }} value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many slides">
            {[8, 12, 16, 20].map((n) => <option key={n} value={n}>about {n} slides</option>)}
          </select>
          <button className={`btn ${lesson.slides.length ? "ghost" : "solid"}`} disabled={busy || st?.claude === false} onClick={auto}>
            {busy ? "making slides…" : lesson.slides.length ? "remake from research" : "make slides from research"}
          </button>
        </>
      ) : <span className="mute" style={{ fontSize: 16 }}>No research yet — build slides by hand, or do Step 2 first.</span>}
      <button className="btn ghost" onClick={() => { const s = blankSlide("text"); setSlides((x) => [...x, s]); setSel(s.id); }}>+ Blank slide</button>
      <Versions lesson={lesson} kind="slides" set={set} />
    </div>
  );

  if (!lesson.slides.length)
    return (
      <div className="card stack" style={{ maxWidth: 720 }}>
        <h2>Slides</h2>
        <p style={{ margin: 0 }}>Turns the research document into a deck: slide titles, short talking points on each slide, plain-language speaker notes underneath, and your {chosen.length} chosen exhibit(s) placed where they fit. Nothing is added that isn’t in the document.</p>
        {maker}
        {busy && <Working since={job.started} what="Making slides" doing="Turning the research document into slides with talking points, speaker notes and your exhibits" usual="1–2 minutes" />}
        {err && <div className="err">{err}</div>}
      </div>
    );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        {maker}
        <span className="mono mute">{lesson.slides.length} slides</span>
      </div>
      {busy && <Working since={job.started} what="Remaking slides" doing="Turning the research document into slides with talking points, speaker notes and your exhibits" usual="1–2 minutes" />}
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="bench slides">
        {slide && (
          <section className={`stage ${over === "stage" ? "over" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver("stage"); } }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const it = readDrag(e); if (it) setSlide(slide.id, (s) => addTo(s, it)); }}>
            <div className="row" style={{ marginBottom: 10, flexWrap: "nowrap" }}>
              <span className="mono mute">{pad(lesson.slides.indexOf(slide) + 1)}</span>
              <input className="input plain h grow" value={slide.title} onChange={(e) => edit({ title: e.target.value })} aria-label="Slide title" />
              <select className="select" style={{ width: "auto" }} value={slide.layout} onChange={(e) => edit({ layout: e.target.value as Slide["layout"] })} aria-label="Layout">
                <option value="title">Title</option><option value="text">Text</option><option value="artwork">Artwork</option><option value="compare">Compare two</option>
              </select>
            </div>
            <SlideView s={slide} n={lesson.number} />
            <div className="stack" style={{ marginTop: 14 }}>
              <div>
                <label className="label mono">talking points — a few bullets, one per line{slide.artworks.length ? ", linking the research to this work" : ""}</label>
                <textarea className="area" rows={5} value={slide.body} onChange={(e) => edit({ body: e.target.value })} />
                <div className="mute" style={{ fontSize: 16, marginTop: 4 }}>{slide.layout === "text" ? "Shown on the slide and in your presenter notes." : slide.layout === "title" ? "Shown under the title." : "In your presenter notes; the slide shows just the work and its caption."}</div>
              </div>
              {slide.notes && (
                <div><label className="label mono">notes from your deck</label><textarea className="area" rows={3} value={slide.notes} onChange={(e) => edit({ notes: e.target.value })} /></div>
              )}
              {slide.images.length > 0 && (
                <div className="thumbs">
                  {slide.images.map((im, i) => (
                    <div key={i} className="t" title={im.credit}>
                      <div className="photo"><img src={proxied(im.url)} alt="" /></div>
                      <div className="mono" style={{ fontSize: 12, marginTop: 3 }}>{im.rights === "public-domain" ? "public domain" : im.rights === "own" ? "yours" : "rights: check"}</div>
                      <button className="btn sm solid" onClick={() => setSlide(slide.id, (s) => ({ ...s, images: s.images.filter((_, j) => j !== i), artworks: s.artworks.filter((a) => caption(a) !== im.credit) }))} aria-label="Remove image">×</button>
                    </div>
                  ))}
                </div>
              )}
              <Src sources={slide.sources} />
              <div className="row">
                <button className="btn sm ghost" onClick={() => { const c = { ...slide, id: uid(), check: undefined }; setSlides((x) => { const i = x.findIndex((y) => y.id === slide.id); const n = [...x]; n.splice(i + 1, 0, c); return n; }); setSel(c.id); }}>Duplicate</button>
                <button className="btn sm ghost" onClick={() => { if (confirm("Delete this slide?")) { setSlides((x) => x.filter((y) => y.id !== slide.id)); setSel(null); } }}>Delete slide</button>
              </div>
            </div>
          </section>
        )}
        <aside className="drawer">
          <div className="dtabs" role="tablist">
            {(["exhibits", "textbook", "images", "library"] as const).map((t) => (
              <button key={t} role="tab" className="dtab mono" aria-selected={tool === t} onClick={() => setTool(t)}>{t === "images" ? "My images" : t}</button>
            ))}
          </div>
          <div className="dbody">
            <div className={tool === "exhibits" ? "stack" : "hide"}>
              {chosen.length > 0 && (
                <>
                  <div className="mono mute">Your exhibits — drag onto a slide or click +</div>
                  <div className="exhibits">
                    {chosen.map((a) => (
                      <div key={a.url} className="ex grab" draggable onDragStart={(e) => startDrag(e, { kind: "artwork", artwork: a })}>
                        <div className="photo">{a.thumbUrl && <img src={proxied(a.thumbUrl)} alt="" />}</div>
                        <b>{a.title}</b>
                        <button className="btn sm ghost" onClick={() => addArt(a)}>+ To slide</button>
                      </div>
                    ))}
                  </div>
                  <hr className="rule" />
                </>
              )}
              <ExhibitsPanel q={q} setQ={setQ} onAdd={addArt} addLabel="+ To slide" />
            </div>
            <div className={tool === "textbook" ? "" : "hide"}><TextbookPanel books={books} /></div>
            <div className={tool === "images" ? "" : "hide"}><FilesPanel /></div>
            <div className={tool === "library" ? "" : "hide"}>
              <LibraryPanel lesson={lesson} resources={resources} toggle={(id) => set((l) => ({ ...l, readings: l.readings.includes(id) ? l.readings.filter((x) => x !== id) : [...l.readings, id] }))} />
            </div>
          </div>
        </aside>
      </div>

      <div className={`strip ${over === "strip" ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver("strip"); }} onDragLeave={() => setOver(null)} onDrop={(e) => dropOnStrip(e)}>
        {lesson.slides.map((s, i) => {
          const state = slideState(s);
          return (
            <button key={s.id} className="fr" aria-selected={slide?.id === s.id} onClick={() => setSel(s.id)} draggable
              onDragStart={(e) => { e.dataTransfer.setData(FRAME, s.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropOnStrip(e, i); }}>
              <SlideView s={s} n={lesson.number} />
              <span className="n"><span>{pad(i + 1)}</span><span className={`v ${stateMark[state]}`}>{stateText[state]}</span></span>
            </button>
          );
        })}
        <button className="add" onClick={() => { const s = blankSlide("text"); setSlides((x) => [...x, s]); setSel(s.id); }}>+ Slide<br />or drop here</button>
      </div>
      <div className="nextbar">
        <span className="mute">Drag frames to reorder. Everything saves automatically.</span>
      </div>
    </>
  );
}

/* ───────── Step 4: check & finish ───────── */

function FinishStep({ lesson, course, set }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void }) {
  const router = useRouter();
  const st = useStatus();
  const job = useJob(`check:${lesson.id}`);
  const busy = job.running;
  const [pptx, setPptx] = useState(false);
  const [err, setErr] = useState("");
  const r = readiness(lesson);

  async function check(all: boolean) {
    setErr("");
    const targets = lesson.slides.filter((s) => all || !s.check);
    const items = checkItems(targets);
    const ids = new Set(targets.map((t) => t.id));
    const at = new Date().toISOString();
    if (!items.length) return set((l) => ({ ...l, slides: l.slides.map((s) => (ids.has(s.id) ? { ...s, check: { at, claims: [] } } : s)) }));
    job.clearError();
    await job.run(async () => {
      const key = `check:${lesson.id}`;
      const res = await api<{ claims: Claim[]; at: string }>("/api/check", { method: "POST", body: JSON.stringify({ items, jobKey: key }) });
      set((l) => withCheck(l, res, [...ids]));
      forget(key);
    });
  }

  return (
    <div className="stack">
      <div className="readybar" style={{ marginTop: 0 }}>
        <div className="row mono" style={{ gap: 18 }}>
          <span className={`v ${r.problems ? "bad" : "ok"}`}>{r.problems} to fix</span>
          <span className={`v ${r.unchecked ? "todo" : "ok"}`}>{r.unchecked} not checked</span>
          <span className={`v ${r.unverified ? "unv" : "ok"}`}>{r.unverified} unverified</span>
          {r.rights > 0 && <span className="mute">{r.rights} image(s): rights to check</span>}
        </div>
        <div className="row">
          <button className="btn" disabled={busy || st?.claude === false || !lesson.slides.length} onClick={() => check(false)}>{busy ? "checking…" : r.unchecked ? `fact-check ${r.unchecked} slide(s)` : "re-check all"}</button>
        </div>
      </div>
      {busy && <Working since={job.started} what="Fact-checking" doing="Searching the web to check every name, date and claim on your slides" usual="1–3 minutes" />}
      {(err || job.error) && <div className="err">{err || job.error}</div>}
      <div className="list">
        {lesson.slides.map((s, i) => {
          const state = slideState(s);
          return (
            <div key={s.id} className="item" style={{ gridTemplateColumns: "180px 1fr" }}>
              <SlideView s={s} n={lesson.number} />
              <div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{pad(i + 1)} · {s.title || "Untitled"}</b>
                  <span className={`v ${stateMark[state]}`}>{stateText[state]}</span>
                </div>
                {s.check ? (s.check.claims.length ? <Claims claims={s.check.claims} /> : <p className="mute" style={{ margin: "4px 0 0" }}>No checkable facts.</p>) : <p className="mute" style={{ margin: "4px 0 0" }}>Not checked since the last change.</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="nextbar">
        <div className="row">
          <button className="btn ghost" disabled={pptx || !lesson.slides.length} onClick={async () => { setPptx(true); try { await downloadPptx(lesson); } finally { setPptx(false); } }}>{pptx ? "Building…" : "PowerPoint ↓"}</button>
          {lesson.research && <button className="btn ghost" onClick={() => downloadDocx(lesson, course)}>Research document ↓</button>}
        </div>
        <div className="row">
          {!r.ok && <span className="mute" style={{ fontSize: 16 }}>{r.problems ? "Fix the ✗ facts first." : r.unchecked ? "Run the fact-check first." : "Add slides first."}</span>}
          <button className="btn solid" disabled={!r.ok}
            onClick={() => {
              if (r.unverified && !confirm(`${r.unverified} slide(s) still have facts no source could confirm. You've checked these yourself?`)) return;
              set((l) => ({ ...l, status: "ready", readyAt: new Date().toISOString() }));
              router.push(`/classes?open=${lesson.id}`);
            }}>
            {lesson.status === "ready" ? "Save to Classes →" : "Ready for class →"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── page ───────── */

export default function Prep() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, courses, lessons, updateLessons, updateCourses, courseName } = useStudio();
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [creating, setCreating] = useState(false);
  const [talk, setTalk] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const want = params.get("lesson");
    if (params.get("new")) { setCreating(true); setStep(1); return; }
    const l = lessons.find((x) => x.id === want) ?? (!lessonId ? lessons.find((x) => x.status === "draft") : undefined);
    if (l) { setLessonId(l.id); setStep(params.get("improve") ? 2 : l.slides.length ? 3 : l.research ? 2 : l.premise ? 2 : 1); }
    else if (!lessonId) setCreating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  const lesson = creating ? null : lessons.find((l) => l.id === lessonId) ?? null;
  const set = (fn: (l: Lesson) => Lesson) => lesson && updateLessons((cur) => cur.map((l) => (l.id === lesson.id ? fn(l) : l)));
  const course = lesson ? courseName(lesson.courseId) : "";

  // Pick up results that finished while this page was closed or reloaded.
  useEffect(() => {
    if (!ready || !lessonId) return;
    const id = lessonId;
    const upd = (fn: (l: Lesson) => Lesson) => updateLessons((cur) => cur.map((l) => (l.id === id ? fn(l) : l)));
    recover(`research:${id}`, (d) => upd((l) => withResearch(l, d as ResearchDoc)));
    recover(`slides:${id}`, (d) => upd((l) => withSlides(l, d as Slide[])));
    recover(`review:${id}`, (d) => upd((l) => withReview(l, d as ReviewDoc)));
    recover(`chat:${id}`, (d) => upd((l) => withChat(l, undefined, d as { reply: string; sources: Source[]; ops: ChatOp[] })));
    recover(`check:${id}`, (d, m) => upd((l) => withCheck(l, d as { claims: Claim[]; at: string }, ((m as { ids?: string[] } | null)?.ids ?? []).filter(Boolean))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lessonId]);

  function saveBrief(b: { courseId: string; newCourse?: string; number: number; topic: string; premise: string }) {
    let courseId = b.courseId;
    if (b.newCourse) {
      courseId = uid();
      updateCourses((cur) => [...cur, { id: courseId, name: b.newCourse! }]);
    }
    if (lesson) set((l) => ({ ...l, courseId, number: b.number, topic: b.topic, premise: b.premise }));
    else {
      const l: Lesson = { id: uid(), courseId, number: b.number, topic: b.topic, premise: b.premise, readings: [], slides: [], status: "draft" };
      updateLessons((cur) => [...cur, l]);
      setLessonId(l.id);
      setCreating(false);
      router.replace(`/prep?lesson=${l.id}`);
    }
    setStep(2);
  }

  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  const steps: [Step, string][] = [[1, "Brief"], [2, "Research & ideas"], [3, "Slides"], [4, "Check & finish"]];
  const done = (n: Step) => !!lesson && (n === 1 ? true : n === 2 ? !!(lesson.research || lesson.review) : n === 3 ? lesson.slides.length > 0 : lesson.status === "ready");
  const byCourse = courses.map((c) => ({ c, ls: lessons.filter((l) => l.courseId === c.id).sort((a, b) => a.number - b.number) })).filter((g) => g.ls.length);

  return (
    <main className={`page ${talk && lesson ? "withtalk" : ""}`}>
      <div className="head" style={{ marginBottom: 18 }}>
        <div className="grow">
          <div className="mono mute">{lesson ? `${course} · Class ${pad(lesson.number)}${lesson.status === "ready" ? " · in Classes" : ""}${lesson.example ? " · example" : ""}` : "New class"}</div>
          <h1 style={{ marginTop: 6 }}>{lesson ? lesson.topic : "Prep"}</h1>
        </div>
        <div className="row">
          {lessons.length > 0 && (
            <select className="select" style={{ width: "auto", maxWidth: 280 }} value={lesson?.id ?? ""} aria-label="Open a class"
              onChange={(e) => { const l = lessons.find((x) => x.id === e.target.value); if (!l) return; setCreating(false); setLessonId(l.id); setStep(l.slides.length ? 3 : l.research ? 2 : 1); router.replace(`/prep?lesson=${l.id}`); }}>
              <option value="" disabled>Open a class…</option>
              {byCourse.map(({ c, ls }) => (
                <optgroup key={c.id} label={c.name}>
                  {ls.map((l) => <option key={l.id} value={l.id}>Class {l.number}: {l.topic}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          <button className="btn ghost" onClick={() => { setCreating(true); setStep(1); router.replace("/prep?new=1"); }}>+ New class</button>
        </div>
      </div>

      <nav className="steps" aria-label="Steps">
        {steps.map(([n, label]) => (
          <button key={n} className="stepb" aria-current={step === n ? "step" : undefined} disabled={!lesson && n !== 1} onClick={() => setStep(n)}>
            <span className="mono">{done(n) && step !== n ? "✓" : pad(n)}</span> {label}
          </button>
        ))}
      </nav>

      {step === 1 && <Brief key={lesson?.id ?? `new-${params.get("course") ?? ""}`} lesson={lesson} preset={params.get("course")} onSave={saveBrief} />}
      {lesson && step === 2 && (lesson.slides.length > 0 || (lesson.materials?.length ?? 0) > 0 || lesson.review) && (
        <Improve key={lesson.id} lesson={lesson} course={course} set={set} autoRun={params.get("improve") === "1"} />
      )}
      {lesson && step === 2 && <ResearchStep lesson={lesson} course={course} set={set} onNext={() => setStep(3)} />}
      {lesson && step === 3 && <SlidesStep lesson={lesson} course={course} set={set} resources={resources} onNext={() => setStep(4)} />}
      {lesson && step === 4 && <FinishStep lesson={lesson} course={course} set={set} />}

      {lesson && (
        <div className="stepnav">
          {step > 1 ? <button className="btn" onClick={() => setStep((step - 1) as Step)}>← back: {steps[step - 2][1].toLowerCase()}</button> : <span />}
          {step < 4 && <button className="btn solid" onClick={() => setStep((step + 1) as Step)}>next: {steps[step][1].toLowerCase()} →</button>}
        </div>
      )}
      {lesson && !talk && <button className="talk-open btn solid" onClick={() => setTalk(true)}>talk it through</button>}
      {lesson && talk && <Talk key={lesson.id} lesson={lesson} course={course} set={set} close={() => setTalk(false)} />}

      {lesson && step === 1 && (
        <p className="mute" style={{ fontSize: 16, marginTop: 14 }}>
          Finished classes live in <Link href="/classes">Classes</Link>.{" "}
          <button className="linkish" onClick={() => { if (confirm(`Delete Class ${lesson.number}: ${lesson.topic}? This removes its research and slides.`)) { updateLessons((cur) => cur.filter((l) => l.id !== lesson.id)); setLessonId(null); setCreating(true); router.replace("/prep?new=1"); } }}>Delete this class</button>
        </p>
      )}
    </main>
  );
}
