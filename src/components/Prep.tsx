"use client";
// Prep: four steps. 1 Brief → 2 Research (document, questions, exhibits) → 3 Slides → 4 Check & finish.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, proxied, uid, useCollection, useStatus } from "@/lib/client";
import { downloadDocx } from "@/lib/docx";
import { MIME, readDrag, startDrag } from "@/lib/drag";
import { recover, runJob, useJob } from "@/lib/jobs";
import { makeClass, runCheck, runResearch, runSlides, slideCount } from "@/lib/make";
import { confirmClaim, restore, withChat, withCheck, withResearch, withReview, withSlides } from "@/lib/lessonOps";
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

type BriefData = { courseId: string; newCourse?: string; number: number; topic: string; premise: string; minutes?: number };

function Brief({ lesson, preset, onSave, onMake }: { lesson: Lesson | null; preset?: string | null; onSave: (b: BriefData) => void; onMake: (b: BriefData) => void }) {
  const { courses, lessons } = useStudio();
  const real = courses.filter((c) => c.id !== OTHER);
  const [courseId, setCourseId] = useState(lesson?.courseId && lesson.courseId !== OTHER ? lesson.courseId : real.find((c) => c.id === preset)?.id ?? real[0]?.id ?? "new");
  const [newCourse, setNewCourse] = useState("");
  const nextNum = (cid: string) => Math.max(0, ...lessons.filter((l) => l.courseId === cid).map((l) => l.number)) + 1;
  const [number, setNumber] = useState(lesson?.number ?? nextNum(courseId));
  const [topic, setTopic] = useState(lesson?.topic ?? "");
  const [premise, setPremise] = useState(lesson?.premise ?? "");
  const [minutes, setMinutes] = useState<number | undefined>(lesson?.minutes);
  const st = useStatus();
  const ok = topic.trim() && (courseId !== "new" || newCourse.trim());
  const data = (): BriefData => ({ courseId, newCourse: courseId === "new" ? newCourse.trim() : undefined, number, topic: topic.trim(), premise: premise.trim(), minutes });

  return (
    <form
      className="card stack"
      style={{ maxWidth: 720 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onSave(data());
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
        <div style={{ width: 150 }}>
          <label className="label mono">Class length</label>
          <select className="select" value={minutes ?? ""} onChange={(e) => setMinutes(Number(e.target.value) || undefined)}>
            <option value="">—</option>
            {[50, 75, 100, 150].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
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
        <button type="button" className="btn solid" disabled={!ok || st?.claude === false} onClick={() => ok && onMake(data())} title="Research, slides with exhibits, and fact-check — in one go">
          make my class
        </button>
        <button className="btn">{lesson ? "save — I'll go step by step" : "step by step"}</button>
      </div>
      <p className="mute" style={{ margin: 0, fontSize: 16 }}>
        <b>make my class</b> does it all in one go (about 5–8 minutes): research, slides with the best exhibits, then a fact-check. You can work elsewhere meanwhile and change anything afterwards.
      </p>
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
      await runResearch(lesson, course, set);
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

function SlidesStep({ lesson, course, set, resources, initial }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; resources: Resource[]; initial?: string | null }) {
  const st = useStatus();
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (initial) setSel(initial);
  }, [initial]);
  useEffect(() => {
    const go = (e: Event) => setSel((e as CustomEvent<string>).detail);
    window.addEventListener("pine:goto-slide", go);
    return () => window.removeEventListener("pine:goto-slide", go);
  }, []);
  const checkJob = useJob(`check:${lesson.id}`);
  const [tool, setTool] = useState<"exhibits" | "textbook" | "images" | "library">("exhibits");
  const [q, setQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [count, setCount] = useState(slideCount(lesson.minutes));
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
      const slides = await runSlides(lesson, course, set, count);
      setSel(slides[0]?.id ?? null);
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
  // ← / → move between slides (when not typing).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const i = lesson.slides.findIndex((x) => x.id === (slide?.id ?? ""));
      const j = Math.max(0, Math.min(lesson.slides.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
      if (lesson.slides[j]) setSel(lesson.slides[j].id);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [lesson.slides, slide?.id]);

  // Quiet fact-check: about 20 seconds after she stops editing, check the slides that changed.
  const pendingCheck = lesson.slides.filter((x) => !x.check && [x.title, x.body, x.notes].some((t) => t.trim())).map((x) => x.id + x.title + x.body).join("|");
  useEffect(() => {
    if (!pendingCheck || st?.claude !== true || checkJob.running || busy) return;
    const t = setTimeout(() => {
      checkJob.clearError();
      checkJob.run(() => runCheck(lesson, set));
    }, 20_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCheck, st?.claude, checkJob.running, busy]);

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
      {checkJob.error && <div className="err" style={{ marginBottom: 12 }}>Fact-check: {checkJob.error}</div>}
      {busy && <Working since={job.started} what="Remaking slides" doing="Turning the research document into slides with talking points, speaker notes and your exhibits" usual="1–2 minutes" />}
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="bench slides">
        {slide && (
          <section className={`stage ${over === "stage" ? "over" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver("stage"); } }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const it = readDrag(e); if (it) setSlide(slide.id, (s) => addTo(s, it)); }}>
            <div className="row" style={{ marginBottom: 10, justifyContent: "space-between" }}>
              <span className="mono mute">slide {pad(lesson.slides.indexOf(slide) + 1)} of {lesson.slides.length} · click the title to edit · ← → to move</span>
              <span className="row" style={{ gap: 12 }}>
                <span className={`v ${stateMark[slideState(slide)]}`}>{checkJob.running && !slide.check ? "checking…" : stateText[slideState(slide)]}</span>
                <select className="select" style={{ width: "auto" }} value={slide.layout} onChange={(e) => edit({ layout: e.target.value as Slide["layout"] })} aria-label="Layout">
                  <option value="title">title</option><option value="text">text</option><option value="artwork">one work</option><option value="compare">compare two</option>
                </select>
              </span>
            </div>
            <SlideView
              s={slide}
              n={lesson.number}
              edit={{
                onTitle: (t) => edit({ title: t }),
                onRemoveImage: (i) => setSlide(slide.id, (x) => ({ ...x, images: x.images.filter((_, j) => j !== i), artworks: x.artworks.filter((a) => caption(a) !== x.images[i]?.credit), check: undefined })),
              }}
            />
            <div className="stack" style={{ marginTop: 14 }}>
              <div>
                <label className="label mono">talking points — a few bullets, one per line{slide.artworks.length ? ", linking the research to this work" : ""}</label>
                <textarea className="area" rows={5} value={slide.body} onChange={(e) => edit({ body: e.target.value })} />
                <div className="mute" style={{ fontSize: 16, marginTop: 4 }}>{slide.layout === "text" ? "Shown on the slide and in your presenter notes." : slide.layout === "title" ? "Shown under the title." : "In your presenter notes; the slide shows just the work and its caption."}</div>
              </div>
              {slide.notes && (
                <div><label className="label mono">notes from your deck</label><textarea className="area" rows={3} value={slide.notes} onChange={(e) => edit({ notes: e.target.value })} /></div>
              )}
              {slide.check && slide.check.claims.some((c) => c.verdict !== "supported" || c.confirmed) && (
                <Claims claims={slide.check.claims} onConfirm={(ci, ok) => set((l) => confirmClaim(l, slide.id, ci, ok))} />
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
            {(more ? (["exhibits", "textbook", "images", "library"] as const) : (["exhibits"] as const)).map((t) => (
              <button key={t} role="tab" className="dtab mono" aria-selected={tool === t} onClick={() => setTool(t)}>{t === "images" ? "my images" : t}</button>
            ))}
            {!more && <button className="dtab mono" onClick={() => setMore(true)} title="textbook pages, your own images, library">+ more</button>}
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
              <span className="n"><span>{pad(i + 1)}</span><span className={`v ${stateMark[state]}`}>{checkJob.running && !s.check ? "checking…" : stateText[state]}</span></span>
            </button>
          );
        })}
        <button className="add" onClick={() => { const s = blankSlide("text"); setSlides((x) => [...x, s]); setSel(s.id); }}>+ Slide<br />or drop here</button>
      </div>
      <div className="nextbar">
        <span className="mute">Drag frames to reorder. Slides are fact-checked automatically a few seconds after you stop editing. Everything saves automatically.</span>
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
  const nums = (pred: (st: ReturnType<typeof slideState>) => boolean) => lesson.slides.map((x, i) => (pred(slideState(x)) ? i + 1 : 0)).filter(Boolean);
  const uncheckedNums = nums((x) => x === "unchecked");
  const problemNums = nums((x) => x === "problem");
  const list = (ns: number[]) => (ns.length > 4 ? `${ns.slice(0, 4).join(", ")} and ${ns.length - 4} more` : ns.join(", "));

  async function check(all: boolean) {
    setErr("");
    job.clearError();
    await job.run(() => runCheck(lesson, set, all));
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
          <button className="btn" disabled={busy || st?.claude === false || !lesson.slides.length} onClick={() => check(!r.unchecked)}>{busy ? "checking…" : r.unchecked ? `fact-check ${r.unchecked} slide(s) now` : "re-check all"}</button>
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
                {s.check ? (s.check.claims.length ? <Claims claims={s.check.claims} onConfirm={(ci, ok) => set((l) => confirmClaim(l, s.id, ci, ok))} /> : <p className="mute" style={{ margin: "4px 0 0" }}>No checkable facts.</p>) : <p className="mute" style={{ margin: "4px 0 0" }}>Not checked since the last change.</p>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="nextbar">
        <div className="row">
          <button className="btn ghost" disabled={pptx || !lesson.slides.length} onClick={async () => { setPptx(true); try { await downloadPptx(lesson); } finally { setPptx(false); } }}>{pptx ? "Building…" : "PowerPoint ↓"}</button>
          {lesson.research && <button className="btn ghost" onClick={() => downloadDocx(lesson, course)}>Research document ↓</button>}
          <a className="btn ghost" href={`/handout/${lesson.id}`} target="_blank" rel="noreferrer">Student handout ↓</a>
        </div>
        <div className="row">
          {!r.clean && (
            <span className="mute" style={{ fontSize: 17 }}>
              {!lesson.slides.length
                ? "Add slides first."
                : [
                    r.problems ? `slide ${list(problemNums)}: a fact looks wrong (✗)` : "",
                    r.unchecked ? `slide ${list(uncheckedNums)} not checked yet` : "",
                    r.unverified ? `${r.unverified} slide(s) with unconfirmed facts` : "",
                  ].filter(Boolean).join(" · ") + " — you can still go ahead."}
            </span>
          )}
          {r.unchecked > 0 && (
            <button className="btn" disabled={busy || st?.claude === false} onClick={() => check(false)}>{busy ? "checking…" : "check now"}</button>
          )}
          <button className="btn solid" disabled={!r.ok}
            onClick={() => {
              if (r.problems && !confirm(`The check thinks slide ${list(problemNums)} has a wrong fact. Go ahead anyway?`)) return;
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
  const makeJob = useJob(`make:${lessonId ?? "new"}`);
  const history = useRef<Lesson[]>([]);
  const lastPush = useRef(0);
  const current = useRef<Lesson | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const want = params.get("lesson");
    if (params.get("new")) { setCreating(true); setStep(1); return; }
    const l = lessons.find((x) => x.id === want) ?? (!lessonId ? lessons.find((x) => x.status === "draft") : undefined);
    const asked = Number(params.get("step"));
    if (l) { setLessonId(l.id); setStep(asked >= 1 && asked <= 4 ? (asked as Step) : params.get("slide") ? 3 : params.get("improve") ? 2 : l.slides.length ? 3 : l.research ? 2 : l.premise ? 2 : 1); }
    else if (!lessonId) setCreating(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  const lesson = creating ? null : lessons.find((l) => l.id === lessonId) ?? null;
  current.current = lesson;
  // Every change keeps the previous state for ⌘Z / undo (typing bursts count as one change).
  const set = useCallback(
    (fn: (l: Lesson) => Lesson) => {
      const id = current.current?.id ?? lessonId;
      if (!id) return;
      const now = Date.now();
      if (current.current && now - lastPush.current > 1500) {
        history.current = [...history.current.slice(-29), current.current];
        bump((n) => n + 1);
      }
      lastPush.current = now;
      updateLessons((cur) => cur.map((l) => (l.id === id ? fn(l) : l)));
    },
    [lessonId, updateLessons],
  );
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    lastPush.current = 0;
    bump((n) => n + 1);
    updateLessons((cur) => cur.map((l) => (l.id === prev.id ? prev : l)));
  }, [updateLessons]);
  useEffect(() => {
    history.current = [];
    bump((n) => n + 1);
  }, [lessonId]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName)) return; // let the text box undo its own typing
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [undo]);
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
    recover(`check:${id}`, (d, m) => upd((l) => withCheck(l, d as { claims: Claim[]; at: string }, ((d as { checked?: string[] }).checked ?? (m as { ids?: string[] } | null)?.ids ?? []).filter(Boolean))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lessonId]);

  function saveBrief(b: BriefData, then: Step = 2): Lesson {
    let courseId = b.courseId;
    if (b.newCourse) {
      courseId = uid();
      updateCourses((cur) => [...cur, { id: courseId, name: b.newCourse! }]);
    }
    let saved: Lesson;
    if (lesson) {
      saved = { ...lesson, courseId, number: b.number, topic: b.topic, premise: b.premise, minutes: b.minutes };
      set(() => saved);
    } else {
      saved = { id: uid(), courseId, number: b.number, topic: b.topic, premise: b.premise, minutes: b.minutes, readings: [], slides: [], status: "draft" };
      updateLessons((cur) => [...cur, saved]);
      setLessonId(saved.id);
      setCreating(false);
      router.replace(`/prep?lesson=${saved.id}`);
    }
    setStep(then);
    return saved;
  }

  // Things the chat asked for ("finish up", "check it", "show me slide 5", …), run after its reply.
  async function onActions(ops: ChatOp[]) {
    const id = current.current?.id;
    if (!id) return;
    await new Promise((ok) => setTimeout(ok, 60)); // let the reply's own edits land first
    const latest = () => current.current ?? lessons.find((l) => l.id === id)!;
    const upd = (fn: (x: Lesson) => Lesson) => updateLessons((cur) => cur.map((x) => (x.id === id ? fn(x) : x)));
    const say = (text: string) => upd((l) => ({ ...l, chat: [...(l.chat ?? []), { id: uid(), role: "assistant" as const, text, at: new Date().toISOString() }].slice(-40) }));
    const c = courseName(latest().courseId) || "";
    for (const o of ops) {
      if (o.op === "goto_slide") {
        setStep(3);
        setTimeout(() => window.dispatchEvent(new CustomEvent("pine:goto-slide", { detail: o.slideId })), 50);
      } else if (o.op === "run_check") {
        setStep(4);
        say((await runJob(`check:${id}`, () => runCheck(latest(), upd))) ? "Fact-check done — see step 4." : "The fact-check didn't finish — try again in a moment.");
      } else if (o.op === "run_slides") {
        setStep(3);
        say((await runJob(`slides:${id}`, () => runSlides(latest(), c, upd, o.count).then(() => {}))) ? "New slides are ready (the old ones are under “earlier versions”)." : "Remaking the slides didn't finish — your current slides are unchanged.");
      } else if (o.op === "run_research") {
        setStep(2);
        say((await runJob(`research:${id}`, () => runResearch(latest(), c, upd).then(() => {}))) ? "The new research document is ready (the old one is under “earlier versions”)." : "The new research didn't finish — your current document is unchanged.");
      } else if (o.op === "finish") {
        setStep(4);
        await runJob(`make:${id}`, async (stage) => {
          if (latest().slides.some((x) => !x.check)) {
            stage("checking the last slides");
            await runCheck(latest(), upd).catch(() => {}); // finishing goes ahead even if the check can't run
          }
          stage("marking it ready");
          upd((l) => ({ ...l, status: "ready", readyAt: new Date().toISOString() }));
        });
        await new Promise((ok) => setTimeout(ok, 120)); // let the last check land before summing up
        const r = readiness(latest());
        say(`Done — Class ${latest().number} is ready and in Classes.${r.problems ? ` Note: the check still flags slide(s) with a possibly wrong fact (✗) — worth a look.` : ""}${r.unverified ? ` ${r.unverified} slide(s) have facts no source confirmed; that's fine to teach from if you're happy with them.` : ""}`);
      }
    }
  }

  // One click: research → slides → fact-check, in the background.
  function make(l: Lesson) {
    const upd = (fn: (x: Lesson) => Lesson) => updateLessons((cur) => cur.map((x) => (x.id === l.id ? fn(x) : x)));
    runJob(`make:${l.id}`, (stage) => makeClass(l, courseName(l.courseId) || "", upd, stage));
  }
  useEffect(() => {
    if (ready && lesson && params.get("make") === "1" && !lesson.research && !makeJob.running) make(lesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lesson?.id]);

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
          {history.current.length > 0 && <button className="btn ghost" onClick={undo} title="Undo the last change (⌘Z)">undo</button>}
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

      {lesson && makeJob.running && (
        <Working since={makeJob.started} what={makeJob.stage ? `Making your class — ${makeJob.stage}` : "Making your class"} doing="Researching, building slides with exhibits, then fact-checking. You can look around or work in another tab" usual="5–8 minutes" />
      )}
      {lesson && makeJob.error && <div className="err" style={{ marginBottom: 14 }}>{makeJob.error}</div>}
      {step === 1 && <Brief key={lesson?.id ?? `new-${params.get("course") ?? ""}`} lesson={lesson} preset={params.get("course")} onSave={(b) => saveBrief(b)} onMake={(b) => { const l = saveBrief(b, 2); make(l); }} />}
      {lesson && step === 2 && (lesson.slides.length > 0 || (lesson.materials?.length ?? 0) > 0 || lesson.review) && (
        <Improve key={lesson.id} lesson={lesson} course={course} set={set} autoRun={params.get("improve") === "1"} />
      )}
      {lesson && step === 2 && <ResearchStep lesson={lesson} course={course} set={set} onNext={() => setStep(3)} />}
      {lesson && step === 3 && <SlidesStep key={lesson.id} lesson={lesson} course={course} set={set} resources={resources} initial={params.get("slide")} />}
      {lesson && step === 4 && <FinishStep lesson={lesson} course={course} set={set} />}

      {lesson && (
        <div className="stepnav">
          {step > 1 ? <button className="btn" onClick={() => setStep((step - 1) as Step)}>← back: {steps[step - 2][1].toLowerCase()}</button> : <span />}
          {step < 4 && <button className="btn solid" onClick={() => setStep((step + 1) as Step)}>next: {steps[step][1].toLowerCase()} →</button>}
        </div>
      )}
      {lesson && !talk && <button className="talk-open btn solid" onClick={() => setTalk(true)}>talk it through</button>}
      {lesson && talk && <Talk key={lesson.id} lesson={lesson} course={course} set={set} close={() => setTalk(false)} onActions={onActions} />}

      {lesson && step === 1 && (
        <p className="mute" style={{ fontSize: 16, marginTop: 14 }}>
          Finished classes live in <Link href="/classes">Classes</Link>.{" "}
          <button className="linkish" onClick={() => { if (confirm(`Delete Class ${lesson.number}: ${lesson.topic}? This removes its research and slides.`)) { updateLessons((cur) => cur.filter((l) => l.id !== lesson.id)); setLessonId(null); setCreating(true); router.replace("/prep?new=1"); } }}>Delete this class</button>
        </p>
      )}
    </main>
  );
}
