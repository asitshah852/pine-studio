"use client";
// Prep: four steps. 1 Brief → 2 Research (document, questions, exhibits) → 3 Slides → 4 Check & finish.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { load, proxied, save, uid, useCollection, useStatus } from "@/lib/client";
import { downloadDocx } from "@/lib/docx";
import { MIME, readDrag, startDrag } from "@/lib/drag";
import { recover, runJob, useJob } from "@/lib/jobs";
import { makeClass, runCheck, runResearch, runRestyle, runSlides, runTalking, slideCount } from "@/lib/make";
import { oneGate, stopMaking, Stopped } from "@/lib/makeQueue";
import { applyFix, confirmClaim, restore, withChat, withCheck, withResearch, withReview, withSlides } from "@/lib/lessonOps";
import { caption } from "@/lib/museum";
import { addTo, blankSlide, readiness, slideFrom, slideState } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import { OTHER, pad, useStudio } from "@/lib/studio";
import type { Artwork, ChatOp, Claim, Lesson, ResearchDoc, Resource, ReviewDoc, Slide, Source } from "@/lib/types";
import Claims from "./Claims";
import Improve, { importAll, UploadButton } from "./Improve";
import Working from "./Working";
import Inline from "./Inline";
import Versions from "./Versions";
import Talk from "./Talk";
import { ExhibitsPanel, FilesPanel, LibraryPanel, ReusePanel, TextbookPanel } from "./Panels";
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
      <div><label className="label mono">Title</label><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Impressionism and the camera" /></div>
      <div>
        <label className="label mono">What is it about? (optional)</label>
        <textarea className="area" value={premise} onChange={(e) => setPremise(e.target.value)} placeholder="e.g. How photography changed what painters thought painting was for. Link to works students can see at the Art Institute." />
      </div>
      <div className="row">
        <button type="button" className="btn solid" disabled={!ok || st?.claude === false} onClick={() => ok && onMake(data())} title="Notes, slides with pictures and videos, and a fact-check — in one go">
          make my class
        </button>
        <button className="btn">just create it</button>
      </div>
      <p className="mute" style={{ margin: 0, fontSize: 16 }}>
        <b>make my class</b> does it all in one go (about 5–8 minutes): notes, slides with pictures and videos, then a fact-check. You can work elsewhere meanwhile.
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

  const [mode, setMode] = useState<"research" | "restyle">("research");
  async function polish() {
    job.clearError();
    setMode("restyle");
    await job.run(() => runRestyle(lesson, course, set));
  }
  async function run() {
    if (doc && !confirm("Write new notes? (The current ones are kept under earlier versions.)")) return;
    setMode("research");
    job.clearError();
    await job.run(async () => {
      await runResearch(lesson, course, set);
    });
  }

  if (!doc)
    return (
      <div className="stack" style={{ maxWidth: 720 }}>
        <p style={{ margin: 0 }}>No notes yet. pine kitchen writes 1–2 pages from your textbooks and trusted museum and scholarly pages, with a source for every fact, discussion questions, and pictures and videos to show.</p>
        <div className="row">
          <button className="btn solid" disabled={busy || st?.claude === false} onClick={run}>{busy ? "writing…" : "write the notes"}</button>
          <button className="linkish" onClick={onNext}>skip — I’ll make slides by hand</button>
          <Versions lesson={lesson} kind="research" set={set} />
        </div>
        {busy && <Working since={job.started} what="Writing the notes" doing="Reading the matching pages of your textbooks, searching museum, Smarthistory and scholarly pages, writing, then finding pictures and videos" usual="2–3 minutes" />}
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
          <span className="mono mute">{unsourced ? `${unsourced} paragraph${unsourced === 1 ? "" : "s"} without a source yet` : "every paragraph has a source"}</span>
          <div className="row">
            <button className="btn sm ghost" onClick={() => downloadDocx(lesson, course)}>Word ↓</button>
            <details className="minimenu">
              <summary className="linkish">more</summary>
              <div className="minimenu-body">
                <button className="linkish" disabled={busy || st?.claude === false} onClick={polish} title="Clearer, livelier wording, like a good magazine. Facts, quotes and sources stay exactly as they are; the old version is kept.">tidy the writing</button>
                <button className="linkish" disabled={busy} onClick={run}>write new notes</button>
                <Versions lesson={lesson} kind="research" set={set} />
                <button className="linkish" onClick={() => confirm("Delete these notes? (You can get them back from earlier versions.)") && set((l) => withResearch(l, undefined))}>delete the notes</button>
              </div>
            </details>
          </div>
        </div>
        {busy && (mode === "restyle"
          ? <Working since={job.started} what="Tidying the writing" doing="Tightening the wording like a magazine editor; every fact, quote and source stays as it is" usual="about a minute" />
          : <Working since={job.started} what="Writing new notes" doing="Searching museum, Smarthistory and scholarly pages, writing the notes, then finding pictures and videos" usual="2–3 minutes" />)}
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
          <h2 style={{ marginBottom: 4 }}>Pictures & videos</h2>
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
          <h3 className="mono" style={{ fontWeight: 400 }}>Find more pictures & videos</h3>
          <ExhibitsPanel q={q} setQ={setQ} addLabel="+ Use"
            onAdd={(a: Artwork) => setDoc((d) => (d.exhibits.some((x) => x.match?.url === a.url) ? d : { ...d, exhibits: [...d.exhibits, { id: uid(), suggested: a.title, why: "", match: a, use: true }] }))} />
        </div>
      </aside>

      <div className="nextbar">
        <span className="mute">{chosen} picture{chosen === 1 ? "" : "s"} & video{chosen === 1 ? "" : "s"} chosen · {doc.questions.length} questions</span>
      </div>
    </div>
  );
}

/* ───────── Step 3: slides ───────── */

function SlidesStep({ lesson, course, set, resources, initial, onStep }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; resources: Resource[]; initial?: string | null; onStep: (s: 2 | 4) => void }) {
  const st = useStatus();
  const [sel, setSel] = useState<string | null>(initial ?? null);
  const [more, setMore] = useState(false);
  const [focus, setFocusState] = useState(true);
  const [drawer, setDrawer] = useState<"" | "exhibit" | "reuse">(""); // focus view: add an exhibit to this slide / slides from another class
  useEffect(() => setFocusState(load<boolean>("pine.focus", true)), []);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    document.body.classList.toggle("slidesfocus", focus && !menu);
    window.dispatchEvent(new CustomEvent("pine:focus-view", { detail: focus }));
    return () => document.body.classList.remove("slidesfocus");
  }, [focus, menu]);
  const setFocus = (v: boolean) => {
    setFocusState(v);
    save("pine.focus", v);
  };
  useEffect(() => {
    if (initial) setSel(initial);
  }, [initial]);
  useEffect(() => {
    const go = (e: Event) => setSel((e as CustomEvent<string>).detail);
    window.addEventListener("pine:goto-slide", go);
    return () => window.removeEventListener("pine:goto-slide", go);
  }, []);
  const checkJob = useJob(`check:${lesson.id}`);
  const talkJob = useJob(`talk:${lesson.id}`);
  const takeFix = (slideId: string, i: number) => {
    const next = applyFix(lesson, slideId, i);
    if (next) set(() => next);
    return !!next;
  };
  const [tool, setTool] = useState<"exhibits" | "textbook" | "images" | "library" | "reuse">("exhibits");
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
    .filter((a, i, all) => all.findIndex((b) => b.url === a.url) === i)
    .filter((a) => !lesson.slides.some((sl) => sl.artworks.some((w) => w.url === a.url)));
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
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("pine:slide-selected", { detail: slide?.id ?? null }));
  }, [slide?.id]);

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
            {busy ? "making slides…" : lesson.slides.length ? "remake all slides from the notes" : "make the slides"}
          </button>
        </>
      ) : <span className="mute" style={{ fontSize: 16 }}>No notes yet — write them first, or start with a blank slide.</span>}
      <button className="btn ghost" onClick={() => { const s = blankSlide("text"); setSlides((x) => [...x, s]); setSel(s.id); }}>+ blank slide</button>
      {lesson.slides.some((x) => !x.notes.trim()) && (
        <button className="btn ghost" disabled={talkJob.running || st?.claude === false} onClick={() => talkJob.run(async () => { await runTalking(lesson, set); })}>
          {talkJob.running ? "writing talking points…" : `write talking points for ${lesson.slides.filter((x) => !x.notes.trim()).length} slide(s) without them`}
        </button>
      )}
      <Versions lesson={lesson} kind="slides" set={set} />
    </div>
  );

  if (!lesson.slides.length)
    return (
      <div className="stack" style={{ maxWidth: 720 }}>
        <p style={{ margin: 0 }}>No slides yet.{lesson.research ? " Make them from your notes — nothing is added that isn’t in the notes." : ""}</p>
        {maker}
        {busy && <Working since={job.started} what="Making slides" doing="Turning your notes into slides with talking points and your pictures" usual="1–2 minutes" />}
        {err && <div className="err">{err}</div>}
      </div>
    );

  const toolsPanel = (
    <>
          <div className="dtabs" role="tablist">
            {(more ? (["exhibits", "reuse", "textbook", "images", "library"] as const) : (["exhibits", "reuse"] as const)).map((t) => (
              <button key={t} role="tab" className="dtab mono" aria-selected={tool === t} onClick={() => setTool(t)}>{t === "images" ? "my images" : t === "reuse" ? "from another class" : t === "exhibits" ? "pictures & videos" : t}</button>
            ))}
            {!more && <button className="dtab mono" onClick={() => setMore(true)} title="textbook pages, your own images, library">+ more</button>}
          </div>
          <div className="dbody">
            <div className={tool === "exhibits" ? "stack" : "hide"}>
              {chosen.length > 0 && (
                <>
                  <div className="mono mute">Your pictures & videos — drag onto a slide or click +</div>
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
            <div className={tool === "reuse" ? "" : "hide"}>
              <ReusePanel lesson={lesson} onAdd={(add) => { setSlides((x) => { const i = slide ? x.findIndex((y) => y.id === slide.id) : x.length - 1; const c = [...x]; c.splice(i + 1, 0, ...add); return c; }); if (add[0]) setSel(add[0].id); }} />
            </div>
            <div className={tool === "textbook" ? "" : "hide"}><TextbookPanel books={books} /></div>
            <div className={tool === "images" ? "" : "hide"}><FilesPanel /></div>
            <div className={tool === "library" ? "" : "hide"}>
              <LibraryPanel lesson={lesson} resources={resources} toggle={(id) => set((l) => ({ ...l, readings: l.readings.includes(id) ? l.readings.filter((x) => x !== id) : [...l.readings, id] }))} />
            </div>
          </div>
    </>
  );
  const idx = slide ? lesson.slides.indexOf(slide) : -1;
  const go = (d: number) => lesson.slides[idx + d] && setSel(lesson.slides[idx + d].id);
  const stageDrop = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver("stage"); } },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(null); const it = readDrag(e); if (it && slide) setSlide(slide.id, (x) => addTo(x, it)); },
  };
  const editorBody = slide ? (
    <>
            <div className="fmtbar" role="toolbar" aria-label="Slide text formatting" onMouseDown={(e) => e.preventDefault()}>
              <button title="Bold (⌘B)" onClick={() => document.execCommand("bold")}><b>B</b></button>
              <button title="Italic (⌘I)" onClick={() => document.execCommand("italic")}><i>I</i></button>
              <button title="Bullets on / off" onClick={() => document.execCommand("insertUnorderedList")}>• list</button>
              <span className="sep" />
              <button title="Smaller text" onClick={() => edit({ size: Math.max(0.6, +((slide.size ?? 1) - 0.1).toFixed(2)) })}>A−</button>
              <button title="Larger text" onClick={() => edit({ size: Math.min(1.8, +((slide.size ?? 1) + 0.1).toFixed(2)) })}>A+</button>
              <span className="hint">click the title or text on the slide to type</span>
            </div>
            <SlideView
              s={slide}
              n={lesson.number}
              edit={{
                onTitle: (t) => edit({ title: t }),
                onBody: (b) => edit({ body: b }),
                onRemoveImage: (i) => setSlide(slide.id, (x) => ({ ...x, images: x.images.filter((_, j) => j !== i), artworks: x.artworks.filter((a) => caption(a) !== x.images[i]?.credit), check: undefined })),
              }}
            />
            <div className="stack" style={{ marginTop: 14 }}>
              <div>
                <label className="label mono">talking points — what you’ll say while this slide is up (not shown on the slide)</label>
                <textarea className="area talkpts" rows={4} value={slide.notes} onChange={(e) => edit({ notes: e.target.value })}
                  placeholder="A way in from the last slide, the context students need, a question to ask, how this connects to the next idea…" />
                {!slide.notes.trim() && (
                  talkJob.running
                    ? <div className="mute" style={{ marginTop: 6 }}><span className="spinner tiny" aria-hidden="true" /> writing talking points…</div>
                    : <button className="linkish" style={{ marginTop: 6 }} disabled={st?.claude === false} onClick={() => talkJob.run(async () => { await runTalking(lesson, set, [slide.id]); })}>suggest talking points</button>
                )}
                {talkJob.error && <div className="err">{talkJob.error}</div>}
              </div>
              {slide.check && slide.check.claims.length > 0 && (
                <Claims claims={slide.check.claims} onConfirm={(ci, ok) => set((l) => confirmClaim(l, slide.id, ci, ok))} onUseFix={(ci) => takeFix(slide.id, ci)} />
              )}
              {slide.sources.length > 0 && (
                <details className="srcs">
                  <summary className="mute">sources ({slide.sources.length})</summary>
                  <Src sources={slide.sources} />
                </details>
              )}
              <div className="row">
                <button className="btn sm ghost" onClick={() => { if (confirm("Delete this slide?")) { setSlides((x) => x.filter((y) => y.id !== slide.id)); setSel(null); } }}>Delete slide</button>
              </div>
            </div>
    </>
  ) : null;

  // One slide at a time (default): big slide, its talking points, ‹ › and slide numbers.
  if (focus)
    return (
      <>
        <details className="fold slidemore" style={{ marginTop: 0, marginBottom: 12 }}>
          <summary>more</summary>
          <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {maker}
            <button className="btn ghost" onClick={() => setFocus(false)}>show all slides</button>
          </div>
        </details>
        {checkJob.error && <div className="err" style={{ marginBottom: 12 }}>Fact-check: {checkJob.error}</div>}
        {busy && <Working since={job.started} what="Remaking slides" doing="Turning your notes into slides with talking points and your pictures" usual="1–2 minutes" />}
        {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
        {slide && (
          <div className="pptwrap">
            <nav className="rail" aria-label="Slides" onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropOnStrip(e)}>
              {lesson.slides.map((x, i) => (
                <button
                  key={x.id}
                  className={`railitem ${x.id === slide.id ? "on" : ""}`}
                  onClick={() => setSel(x.id)}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData(FRAME, x.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.stopPropagation(); dropOnStrip(e, i); }}
                  title={x.title}
                >
                  <span className="railnum">{i + 1}{slideState(x) === "problem" ? " ✗" : ""}</span>
                  <SlideView s={x} n={lesson.number} />
                </button>
              ))}
              <button className="railadd" onClick={() => { const n = blankSlide("text"); setSlides((x) => { const i = x.findIndex((y) => y.id === slide.id); const c = [...x]; c.splice(i + 1, 0, n); return c; }); setSel(n.id); }} title="Add a slide after this one">+ slide</button>
              <button className="railadd" onClick={() => setDrawer(drawer === "reuse" ? "" : "reuse")} title="Copy slides from another class in after this one">+ from another class</button>
            </nav>
            <div className="pptmain">
              <div className="focusnav">
                <button className="linkish" onClick={() => setMenu(!menu)}>{menu ? "hide menu" : "‹ menu"}</button>
                <Link className="linkish" href={`/present/${lesson.id}`}>▶ present</Link>
                <button className="btn" disabled={idx <= 0} onClick={() => go(-1)} aria-label="Previous slide">‹</button>
                <span>slide {idx + 1} of {lesson.slides.length}</span>
                <button className="btn" disabled={idx >= lesson.slides.length - 1} onClick={() => go(1)} aria-label="Next slide">›</button>
                {slideState(slide) === "problem" && <span className="v bad">✗ a fact to look at — see below</span>}
                <select className="inlineselect" value={slide.layout} onChange={(e) => edit({ layout: e.target.value as Slide["layout"] })} aria-label="Slide layout" title="Slide layout">
                  <option value="title">title slide</option><option value="text">text slide</option><option value="artwork">one picture</option><option value="compare">two pictures side by side</option>
                </select>
              </div>
              <section className={`focusstage ${over === "stage" ? "over" : ""}`} {...stageDrop}>
                {editorBody}
              </section>
              <div className="focustools">
                <button className="btn" onClick={() => setDrawer(drawer === "exhibit" ? "" : "exhibit")}>{drawer === "exhibit" ? "close" : "+ add a picture or video to this slide"}</button>
                <span className="mute">or use the chat: “simplify this slide”, “find a better picture for this”</span>
              </div>
              {drawer === "exhibit" && (
                <div className="focusdrawer stack">
                  {chosen.length > 0 && (
                    <>
                      <div className="mono mute">your pictures & videos not yet on a slide</div>
                      <div className="exhibits">
                        {chosen.map((a) => (
                          <div key={a.url} className="ex">
                            <div className="photo">{a.thumbUrl && <img src={proxied(a.thumbUrl)} alt="" />}</div>
                            <b>{a.title}</b>
                            <button className="btn sm ghost" onClick={() => addArt(a)}>+ to this slide</button>
                          </div>
                        ))}
                      </div>
                      <hr className="rule" />
                    </>
                  )}
                  <ExhibitsPanel q={q} setQ={setQ} onAdd={addArt} addLabel="+ to this slide" />
                </div>
              )}
              {drawer === "reuse" && (
                <div className="focusdrawer">
                  <div className="row" style={{ justifyContent: "space-between" }}><b style={{ fontWeight: 500 }}>slides from another class</b><button className="linkish" onClick={() => setDrawer("")}>close</button></div>
                  <ReusePanel lesson={lesson} onAdd={(add) => { setSlides((x) => { const i = x.findIndex((y) => y.id === slide.id); const c = [...x]; c.splice(i + 1, 0, ...add); return c; }); if (add[0]) setSel(add[0].id); setDrawer(""); }} />
                </div>
              )}
              <div className="stepnav slidenav">
                {idx > 0 ? <button className="btn" onClick={() => go(-1)}>← previous slide</button> : <button className="btn" onClick={() => onStep(2)}>← back: research &amp; ideas</button>}
                {idx < lesson.slides.length - 1 ? <button className="btn solid" onClick={() => go(1)}>next slide →</button> : (lesson.status === "ready" ? <span className="mute">last slide</span> : <button className="btn solid" onClick={() => onStep(4)}>last slide — ready for class →</button>)}
              </div>
            </div>
          </div>
        )}
      </>
    );

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        {maker}
        <span className="row"><span className="mono mute">{lesson.slides.length} slides</span><button className="btn ghost" onClick={() => setFocus(true)}>one slide at a time</button></span>
      </div>
      {checkJob.error && <div className="err" style={{ marginBottom: 12 }}>Fact-check: {checkJob.error}</div>}
      {busy && <Working since={job.started} what="Remaking slides" doing="Turning your notes into slides with talking points and your pictures" usual="1–2 minutes" />}
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
            {editorBody}
          </section>
        )}
        <aside className="drawer">
          {toolsPanel}
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
  const shownSlide = useRef<string | null>(null);
  const autoTalk = useRef(false);
  const [focusView, setFocusView] = useState(false); // slides shown one at a time: the bottom bar moves between slides
  useEffect(() => {
    const f = (e: Event) => {
      setFocusView(!!(e as CustomEvent<boolean>).detail);
      if ((e as CustomEvent<boolean>).detail && !autoTalk.current && window.innerWidth >= 1200) {
        autoTalk.current = true;
        setTalk(true);
      }
    };
    window.addEventListener("pine:focus-view", f);
    return () => window.removeEventListener("pine:focus-view", f);
  }, []);
  useEffect(() => {
    const f = (e: Event) => { shownSlide.current = (e as CustomEvent<string | null>).detail; };
    window.addEventListener("pine:slide-selected", f);
    return () => window.removeEventListener("pine:slide-selected", f);
  }, []);
  const makeJob = useJob(`make:${lessonId ?? "new"}`);
  const [stopAsked, setStopAsked] = useState(false);
  const [upBusy, setUpBusy] = useState("");
  useEffect(() => { if (!makeJob.running) setStopAsked(false); }, [makeJob.running]);
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
    if (l) { setLessonId(l.id); setStep(asked === 2 || asked === 3 ? (asked as Step) : asked === 4 || params.get("slide") ? 3 : params.get("improve") ? 2 : l.slides.length ? 3 : 2); }
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
    recover(`slides:${id}`, (d) => upd((l) => withSlides(l, Array.isArray(d) ? (d as Slide[]) : (d as { slides: Slide[] }).slides)));
    recover(`review:${id}`, (d) => upd((l) => withReview(l, d as ReviewDoc)));
    recover(`talk:${id}`, (d) => { const got = new Map(((d as { slides: { id: string; talking: string }[] }).slides ?? []).map((x) => [x.id, x.talking])); upd((l) => ({ ...l, slides: l.slides.map((x) => (got.has(x.id) && !x.notes.trim() ? { ...x, notes: got.get(x.id)! } : x)) })); });
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
        setStep(3);
        say((await runJob(`check:${id}`, () => runCheck(latest(), upd))) ? "Fact-check done — anything to look at is marked ✗ on the slides." : "The fact-check didn't finish — try again in a moment.");
      } else if (o.op === "run_slides") {
        setStep(3);
        say((await runJob(`slides:${id}`, () => runSlides(latest(), c, upd, o.count).then(() => {}))) ? "New slides are ready (the old ones are under “earlier versions”)." : "Remaking the slides didn't finish — your current slides are unchanged.");
      } else if (o.op === "run_research") {
        setStep(2);
        say((await runJob(`research:${id}`, () => runResearch(latest(), c, upd).then(() => {}))) ? "The new research document is ready (the old one is under “earlier versions”)." : "The new research didn't finish — your current document is unchanged.");
      } else if (o.op === "finish") {
        setStep(3);
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
    const gate = oneGate(l.id);
    runJob(`make:${l.id}`, async (stage) => {
      try {
        await makeClass(l, courseName(l.courseId) || "", upd, stage, gate);
      } catch (e) {
        if (!(e instanceof Stopped)) throw e; // stopping isn't an error; what was made is kept
      }
    });
  }
  useEffect(() => {
    if (ready && lesson && params.get("make") === "1" && !lesson.research && !makeJob.running) make(lesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lesson?.id]);

  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  const tabs: [Step, string][] = [[2, "notes"], [3, "slides"]];
  const r = lesson ? readiness(lesson) : null;
  const firstProblem = lesson?.slides.find((x) => slideState(x) === "problem");
  function markReady() {
    if (!lesson || !r) return;
    if (r.problems && !confirm(`The fact-check thinks ${r.problems} slide(s) may have a wrong fact. Mark the class ready anyway?`)) return;
    set((l) => ({ ...l, status: "ready", readyAt: new Date().toISOString() }));
    router.push(`/classes?open=${lesson.id}`);
  }

  return (
    <main className={`page ${talk && lesson ? "withtalk" : ""}`}>
      {lesson ? (
        <div className="head classhead" style={{ marginBottom: 14 }}>
          <div className="grow">
            <div className="mono mute">
              <Link className="quietlink" href={`/classes?course=${lesson.courseId}`}>{course}</Link> · class {pad(lesson.number)}
              {lesson.example ? " · example" : ""}
              {" · "}
              <select className="inlineselect" value={lesson.minutes ?? ""} onChange={(e) => set((l) => ({ ...l, minutes: Number(e.target.value) || undefined }))} aria-label="Class length">
                <option value="">length not set</option>
                {[50, 75, 100, 150].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
            <h1 style={{ marginTop: 6 }}><Inline value={lesson.topic} onSave={(topic) => set((l) => ({ ...l, topic }))} placeholder="Class title" /></h1>
            <p className="mute" style={{ margin: 0 }}><Inline multiline value={lesson.premise} onSave={(premise) => set((l) => ({ ...l, premise }))} placeholder="Click to add what this class is about" /></p>
          </div>
          <div className="row">
            {history.current.length > 0 && <button className="linkish" onClick={undo} title="Undo the last change (⌘Z)">undo</button>}
            {lesson.status === "ready"
              ? <Link className="btn" href={`/classes?open=${lesson.id}`}>✓ ready — view class</Link>
              : <button className="btn solid" disabled={!lesson.slides.length} onClick={markReady} title={lesson.slides.length ? "Puts it with your finished classes, with PowerPoint, notes, handout and quiz" : "Make the slides first"}>ready for class →</button>}
          </div>
        </div>
      ) : (
        <div className="head" style={{ marginBottom: 18 }}><h1>New class</h1></div>
      )}

      {lesson && (
        <nav className="steps" aria-label="Parts of the class">
          {tabs.map(([n, label]) => (
            <button key={n} className="stepb" aria-current={step === n ? "step" : undefined} onClick={() => setStep(n)}>{label}</button>
          ))}
          {step === 3 && lesson.slides.length > 0 && r && (
            <span className="checkline mute">
              {r.problems
                ? <button className="linkish bad" onClick={() => firstProblem && window.dispatchEvent(new CustomEvent("pine:goto-slide", { detail: firstProblem.id }))}>✗ {r.problems} slide{r.problems === 1 ? "" : "s"} to look at</button>
                : r.unchecked ? `checking ${r.unchecked} slide${r.unchecked === 1 ? "" : "s"}…` : "✓ fact-checked"}
            </span>
          )}
        </nav>
      )}

      {lesson && makeJob.running && (
        <div className="row" style={{ alignItems: "flex-start", gap: 18 }}>
          <Working since={makeJob.started} what={makeJob.stage ? `Making your class — ${makeJob.stage}` : "Making your class"} doing="Writing the notes, building slides with pictures, then fact-checking. You can look around or work in another tab" usual="5–8 minutes" />
          <button className="btn" onClick={() => { stopMaking(lesson.id); setStopAsked(true); }} disabled={stopAsked} title="Stops after the step that's running now; what's made so far is kept">{stopAsked ? "stopping after this step…" : "stop"}</button>
        </div>
      )}
      {lesson && makeJob.error && <div className="err" style={{ marginBottom: 14 }}>{makeJob.error}</div>}
      {!lesson && <Brief key={`brief-new-${params.get("course") ?? ""}`} lesson={null} preset={params.get("course")} onSave={(b) => saveBrief(b)} onMake={(b) => { const l = saveBrief(b, 2); make(l); }} />}
      {lesson && step === 2 && (lesson.slides.length > 0 || (lesson.materials?.length ?? 0) > 0 || lesson.review) && (
        <details className="fold" open={params.get("improve") === "1" || !!lesson.review?.suggestions.some((x) => x.status === "open")} style={{ marginTop: 0, marginBottom: 18 }}>
          <summary>suggest improvements</summary>
          <Improve key={`improve-${lesson.id}`} lesson={lesson} course={course} set={set} autoRun={params.get("improve") === "1"} />
        </details>
      )}
      {lesson && step === 2 && <ResearchStep lesson={lesson} course={course} set={set} onNext={() => setStep(3)} />}
      {lesson && step === 2 && !(lesson.slides.length > 0 || (lesson.materials?.length ?? 0) > 0 || lesson.review) && (
        <div className="row" style={{ marginTop: 14 }}>
          <span className="mute">Have your own slides or handouts?</span>
          <UploadButton label="+ add them" busy={upBusy} onFiles={async (files) => {
            const r2 = await importAll(files, setUpBusy);
            setUpBusy("");
            if (r2.errors.length) alert(r2.errors.join("\n"));
            set((l) => ({ ...l, slides: [...l.slides, ...r2.slides], materials: [...(l.materials ?? []), ...r2.materials] }));
          }} />
        </div>
      )}
      {lesson && step === 3 && <SlidesStep key={`slides-${lesson.id}`} lesson={lesson} course={course} set={set} resources={resources} initial={params.get("slide")} onStep={(s) => (s === 4 ? markReady() : setStep(s))} />}

      {lesson && step === 2 && (
        <div className="stepnav">
          <span />
          <button className="btn solid" onClick={() => setStep(3)}>slides →</button>
        </div>
      )}
      {lesson && step === 3 && !focusView && (
        <div className="stepnav">
          <button className="btn" onClick={() => setStep(2)}>← notes</button>
          {lesson.status !== "ready" && <button className="btn solid" disabled={!lesson.slides.length} onClick={markReady}>ready for class →</button>}
        </div>
      )}
      {lesson && !talk && <button className="talk-open btn solid" onClick={() => setTalk(true)}>talk it through</button>}
      {lesson && talk && <Talk key={`talk-${lesson.id}`} lesson={lesson} course={course} set={set} close={() => setTalk(false)} onActions={onActions} shownSlide={() => (step === 3 ? shownSlide.current : null)} />}
    </main>
  );
}
