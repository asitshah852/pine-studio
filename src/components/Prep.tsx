"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, proxied, readAsBase64, shrinkImage, uid, useCollection, useStatus } from "@/lib/client";
import { MIME, readDrag, startDrag, type DragItem } from "@/lib/drag";
import { caption } from "@/lib/museum";
import { downloadPptx } from "@/lib/pptx";
import { SEED_LESSONS } from "@/lib/seed";
import { addTo, blankSlide, checkItems, readiness, slideFrom, slideState } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import type { Artwork, Claim, Lesson, Research, Resource, Slide, TextbookPoint } from "@/lib/types";
import Claims from "./Claims";
import SlideView from "./SlideView";

type Saved = Research & { id: string; lessonId: string };
const FRAME = "application/x-pine-frame";
const MAX_UPLOAD = 3_800_000; // the host accepts ~4.5 MB per request
const stateMark = { ok: "ok", unverified: "unv", problem: "bad", unchecked: "todo" } as const;
const stateText = { ok: "checked", unverified: "unverified", problem: "fix", unchecked: "not checked" };

function SrcLinks({ sources }: { sources: { title: string; url: string }[] }) {
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

/* ───────────── drawer panels ───────────── */

function ResearchPanel({ lesson, onSearchExhibit }: { lesson: Lesson; onSearchExhibit: (q: string) => void }) {
  const { items, update } = useCollection<Saved>("research", []);
  const st = useStatus();
  const [topic, setTopic] = useState(lesson.topic);
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = items.filter((r) => r.lessonId === lesson.id).sort((a, b) => b.at.localeCompare(a.at));
  const [idx, setIdx] = useState(0);
  const cur = mine[idx];
  useEffect(() => setTopic(lesson.topic), [lesson.topic]);

  async function run() {
    setBusy(true);
    setErr("");
    try {
      const r = await api<Research>("/api/research", { method: "POST", body: JSON.stringify({ topic, angle }) });
      update((all) => [{ ...r, id: uid(), lessonId: lesson.id }, ...all].slice(0, 60));
      setIdx(0);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>Searches museum, Smarthistory and scholarly pages. Each fact keeps the page it came from; anything without a real source is marked “?”. Drag points onto a slide.</p>
      <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic, e.g. Impressionism and the camera" />
      <textarea className="area" style={{ minHeight: 56 }} value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Your angle (optional): e.g. link to Chicago, focus on women photographers, 50-minute class" />
      <div className="row">
        <button className="btn solid" disabled={busy || !topic.trim() || st?.claude === false} onClick={run}>{busy ? "Researching… (1–2 min)" : "Research"}</button>
        {mine.length > 1 && (
          <select className="select" style={{ width: "auto" }} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
            {mine.map((r, i) => <option key={r.id} value={i}>{r.topic} · {r.at.slice(5, 16).replace("T", " ")}</option>)}
          </select>
        )}
      </div>
      {st?.claude === false && <div className="note">Research is off until the Claude key is added (see SETUP.md). Exhibits, Library and slides all work without it.</div>}
      {err && <div className="err">{err}</div>}
      {cur && (
        <div className="stack">
          {cur.overview && (
            <div className="point grab" draggable onDragStart={(e) => startDrag(e, { kind: "text", heading: cur.topic, text: cur.overview, sources: [], verified: false })}>
              <div className="mono mute">Framing (no facts)</div>
              {cur.overview}
            </div>
          )}
          <div>
            {cur.points.map((p, i) => (
              <div key={i} className="point grab" draggable onDragStart={(e) => startDrag(e, { kind: "text", heading: p.heading, text: p.text, sources: p.sources, verified: p.verified })}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b style={{ fontWeight: 600 }}>{p.heading}</b>
                  <span className={`v ${p.verified ? "ok" : "unv"}`}>{p.verified ? "sourced" : "no source"}</span>
                </div>
                <div>{p.text}</div>
                <SrcLinks sources={p.sources} />
              </div>
            ))}
          </div>
          {cur.artworks.length > 0 && (
            <div>
              <div className="mono mute" style={{ marginBottom: 6 }}>Works to look up</div>
              <div className="row">{cur.artworks.map((a) => <button key={a} className="chip" onClick={() => onSearchExhibit(a.replace(/\(.*?\)/g, ""))}>{a} →</button>)}</div>
            </div>
          )}
          {cur.questions.length > 0 && (
            <div>
              <div className="mono mute" style={{ marginBottom: 6 }}>Discussion questions</div>
              {cur.questions.map((q, i) => (
                <div key={i} className="point grab" draggable onDragStart={(e) => startDrag(e, { kind: "text", heading: "Discuss", text: q, sources: [], verified: false })}>{q}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextbookPanel({ books }: { books: Resource[] }) {
  const st = useStatus();
  const [book, setBook] = useState(books[0]?.title ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [points, setPoints] = useState<TextbookPoint[]>([]);
  const res = books.find((b) => b.title === book);

  async function run() {
    setErr("");
    setBusy(true);
    try {
      const pdf = file ? await readAsBase64(file) : undefined;
      if ((pdf?.length ?? 0) + text.length > MAX_UPLOAD) throw new Error("That's too big for one go: upload about 15 pages at a time.");
      const r = await api<{ points: TextbookPoint[] }>("/api/textbook", { method: "POST", body: JSON.stringify({ pdf, text: pdf ? undefined : text, book, ask }) });
      setPoints(r.points);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>Upload pages from your textbook (PDF or scan) or paste a passage. Points come only from those pages, with the page number and the exact words.</p>
      <div>
        <label className="label mono">Book</label>
        <input className="input" list="books" value={book} onChange={(e) => setBook(e.target.value)} />
        <datalist id="books">{books.map((b) => <option key={b.id} value={b.title} />)}</datalist>
      </div>
      <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") setFile(f); }}>
        <input type="file" accept="application/pdf" className="hide" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? `${file.name} · ${(file.size / 1e6).toFixed(1)} MB` : "Drop a PDF of the pages, or click to choose"}
      </label>
      {!file && <textarea className="area" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the passage here" />}
      <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What to pull out (optional): e.g. key terms and 3 works to show" />
      <button className="btn solid" disabled={busy || (!file && !text.trim()) || st?.claude === false} onClick={run}>{busy ? "Reading…" : "Pull out points"}</button>
      {err && <div className="err">{err}</div>}
      {points.map((p, i) => {
        const src = { title: `${book || "Textbook"}${p.page ? `, p. ${p.page}` : ""}`, url: res?.url || `book:${book}${p.page ? `#p${p.page}` : ""}` };
        return (
          <div key={i} className="point grab" draggable onDragStart={(e) => startDrag(e, { kind: "text", text: p.text, sources: [src], verified: true })}>
            {p.text}
            {p.quote && <div className="src" style={{ marginTop: 4 }}>“{p.quote}”</div>}
            <div className="mono mute" style={{ marginTop: 4 }}>{src.title}</div>
          </div>
        );
      })}
    </div>
  );
}

function ExhibitsPanel({ q, setQ, onAdd }: { q: string; setQ: (s: string) => void; onAdd: (a: Artwork) => void }) {
  const [results, setResults] = useState<Artwork[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdOnly, setPdOnly] = useState(false);

  async function search(term = q) {
    if (!term.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/museum?q=${encodeURIComponent(term)}`).then((x) => x.json());
      setResults(r.results ?? []);
      setErrors(r.errors ?? []);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (q) search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const shown = pdOnly ? results.filter((r) => r.publicDomain) : results;
  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("q") as string; setQ(v); search(v); }}>
        <input name="q" className="input grow" defaultValue={q} key={q} placeholder="Artist, title, movement… e.g. Seurat" />
        <button className="btn solid" disabled={busy}>{busy ? "…" : "Search"}</button>
      </form>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="mono mute">Art Institute of Chicago · The Met · Cleveland</span>
        <label className="mono mute"><input type="checkbox" checked={pdOnly} onChange={(e) => setPdOnly(e.target.checked)} /> public domain only</label>
      </div>
      {errors.length > 0 && <div className="note">Couldn’t reach: {errors.join("; ")}</div>}
      <div className="exhibits">
        {shown.map((a) => (
          <div key={`${a.museum}-${a.id}`} className="ex grab" draggable onDragStart={(e) => startDrag(e, { kind: "artwork", artwork: a })} onDoubleClick={() => onAdd(a)} title="Drag onto a slide, or double-click to add to the current slide">
            <div className="photo">
              {a.thumbUrl ? <img src={proxied(a.thumbUrl)} alt="" loading="lazy" /> : <div className="ph" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>no image</div>}
              <span className="rights mono" style={{ fontSize: 9 }}>{a.publicDomain ? "PD" : "©?"}</span>
            </div>
            <b>{a.title}</b>
            <span className="mute">{a.artist.split("\n")[0]}{a.date && `, ${a.date}`}</span>
            <div><a className="mute" href={a.url} target="_blank" rel="noreferrer">{a.museum} ↗</a></div>
          </div>
        ))}
      </div>
      {!busy && q && !shown.length && !errors.length && <div className="empty">No works found.</div>}
      <p className="mute" style={{ fontSize: 12, margin: 0 }}>PD = public domain: full image goes into the deck. ©? = still in copyright: a small preview is used and flagged “rights: check” (classroom fair use is usually fine; posting online may not be).</p>
    </div>
  );
}

function FilesPanel() {
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [credit, setCredit] = useState("Photo: Tanya");
  async function add(list: FileList | null) {
    for (const f of Array.from(list ?? []).filter((f) => f.type.startsWith("image/"))) {
      const url = await shrinkImage(f);
      setFiles((cur) => [...cur, { url, name: f.name }]);
    }
  }
  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>Your own photographs, scans or diagrams. Drop them here, then drag onto a slide.</p>
      <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        <input type="file" accept="image/*" multiple className="hide" onChange={(e) => add(e.target.files)} />
        Drop images, or click to choose
      </label>
      <div><label className="label mono">Credit line</label><input className="input" value={credit} onChange={(e) => setCredit(e.target.value)} /></div>
      <div className="exhibits">
        {files.map((f, i) => (
          <div key={i} className="ex grab" draggable onDragStart={(e) => startDrag(e, { kind: "image", url: f.url, credit: credit || f.name, rights: "own" })}>
            <div className="photo"><img src={f.url} alt="" /></div>
            <span className="mute">{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryPanel({ lesson, resources, toggle }: { lesson: Lesson; resources: Resource[]; toggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = resources.filter((r) => !q || `${r.title} ${r.author} ${r.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter the library…" />
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>Tick to assign as a reading for this class. Drag to put it on a slide.</p>
      {shown.map((r) => (
        <div key={r.id} className="point grab row" style={{ flexWrap: "nowrap", alignItems: "start" }} draggable
          onDragStart={(e) => startDrag(e, { kind: "text", heading: "Reading", text: `${r.title}${r.author ? ` — ${r.author}` : ""}`, sources: r.url ? [{ title: r.title, url: r.url }] : [], verified: true })}>
          <input type="checkbox" checked={lesson.readings.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Assign as reading" />
          <div>
            <div>{r.title}</div>
            <div className="src">{[r.author, r.kind].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── the workbench ───────────── */

export default function Prep() {
  const router = useRouter();
  const params = useSearchParams();
  const { items: lessons, update, ready } = useCollection<Lesson>("lessons", SEED_LESSONS);
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const st = useStatus();
  const drafts = lessons.filter((l) => l.status === "draft").sort((a, b) => a.number - b.number);

  const [lessonId, setLessonId] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"research" | "textbook" | "exhibits" | "library" | "files">("research");
  const [exQ, setExQ] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState("");
  const [busyPptx, setBusyPptx] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const want = params.get("lesson");
    if (params.get("new")) setCreating(true);
    else if (want && lessons.some((l) => l.id === want)) setLessonId(want);
    else if (!lessonId && drafts[0]) setLessonId(drafts[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params]);

  const lesson = lessons.find((l) => l.id === lessonId) ?? null;
  const slide = lesson?.slides.find((s) => s.id === sel) ?? lesson?.slides[0] ?? null;
  const books = useMemo(() => resources.filter((r) => r.kind === "textbook"), [resources]);

  const setLesson = (fn: (l: Lesson) => Lesson) => lesson && update((cur) => cur.map((l) => (l.id === lesson.id ? fn(l) : l)));
  const setSlides = (fn: (s: Slide[]) => Slide[]) => setLesson((l) => ({ ...l, slides: fn(l.slides) }));
  const setSlide = (id: string, fn: (s: Slide) => Slide) => setSlides((ss) => ss.map((s) => (s.id === id ? fn(s) : s)));
  const edit = (patch: Partial<Slide>) => slide && setSlide(slide.id, (s) => ({ ...s, ...patch, check: undefined }));

  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const topic = String(f.get("topic") || "").trim();
    if (!topic) return;
    const l: Lesson = {
      id: uid(),
      number: Number(f.get("number")) || Math.max(0, ...lessons.map((x) => x.number)) + 1,
      date: String(f.get("date") || "") || undefined,
      topic,
      unit: String(f.get("unit") || "").trim() || undefined,
      summary: "",
      readings: [],
      status: "draft",
      slides: [blankSlide("title", topic)],
    };
    update((cur) => [...cur, l]);
    setLessonId(l.id);
    setSel(l.slides[0].id);
    setCreating(false);
    router.replace(`/prep?lesson=${l.id}`);
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
    setSlides((ss) => {
      const next = [...ss];
      next.splice(at ?? next.length, 0, s);
      return next;
    });
    setSel(s.id);
  }

  function dropOnStage(e: React.DragEvent) {
    e.preventDefault();
    setOver(null);
    const item = readDrag(e);
    if (!item || !slide) return;
    setSlide(slide.id, (s) => addTo(s, item));
  }

  async function check(all: boolean) {
    if (!lesson) return;
    setCheckErr("");
    const targets = lesson.slides.filter((s) => all || !s.check);
    const items = checkItems(targets);
    const at = new Date().toISOString();
    if (!items.length) {
      setSlides((ss) => ss.map((s) => (targets.some((t) => t.id === s.id) ? { ...s, check: { at, claims: [] } } : s)));
      return;
    }
    setChecking(true);
    try {
      const r = await api<{ claims: Claim[]; at: string }>("/api/check", { method: "POST", body: JSON.stringify({ items }) });
      const ids = new Set(targets.map((t) => t.id));
      setSlides((ss) => ss.map((s) => (ids.has(s.id) ? { ...s, check: { at: r.at, claims: r.claims.filter((c) => c.slideId === s.id) } } : s)));
      setLesson((l) => ({ ...l, checkedAt: r.at }));
    } catch (e) {
      setCheckErr((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  if (!ready) return <main className="page"><p className="mute">Loading…</p></main>;

  if (creating || !lesson) {
    return (
      <main className="page">
        <div className="head"><div><h1>Prep</h1><p>Prepare the next class: research a topic, pull from your textbook, find exhibits, build the slides, fact-check, then send it to Classes.</p></div></div>
        <div className="row" style={{ alignItems: "start", gap: 36 }}>
          <form className="card stack" style={{ width: 420, maxWidth: "100%" }} onSubmit={create}>
            <h2>New class</h2>
            <div className="row">
              <div style={{ width: 90 }}><label className="label mono">Class #</label><input name="number" className="input" type="number" min={1} defaultValue={Math.max(0, ...lessons.map((l) => l.number)) + 1} /></div>
              <div className="grow"><label className="label mono">Date</label><input name="date" className="input" type="date" /></div>
            </div>
            <div><label className="label mono">Topic</label><input name="topic" className="input" required placeholder="e.g. Impressionism and the camera" autoFocus /></div>
            <div><label className="label mono">Unit</label><input name="unit" className="input" placeholder="e.g. Modernism" /></div>
            <button className="btn solid">Start preparing</button>
          </form>
          {drafts.length > 0 && (
            <div className="stack">
              <div className="mono mute">Or continue</div>
              {drafts.map((d) => <button key={d.id} className="btn ghost" onClick={() => { setLessonId(d.id); setCreating(false); router.replace(`/prep?lesson=${d.id}`); }}>Class {d.number}: {d.topic}</button>)}
            </div>
          )}
        </div>
      </main>
    );
  }

  const r = readiness(lesson);
  const ss = slide ? slideState(slide) : "ok";

  return (
    <main className="page">
      <div className="head" style={{ marginBottom: 20 }}>
        <div className="grow">
          <div className="row mono mute">
            <span>Class</span>
            <input className="input" type="number" style={{ width: 64, padding: "3px 6px" }} value={lesson.number} onChange={(e) => setLesson((l) => ({ ...l, number: Number(e.target.value) || l.number }))} />
            <input className="input" type="date" style={{ width: 150, padding: "3px 6px" }} value={lesson.date ?? ""} onChange={(e) => setLesson((l) => ({ ...l, date: e.target.value || undefined }))} />
            <input className="input" style={{ width: 160, padding: "3px 6px" }} placeholder="Unit" value={lesson.unit ?? ""} onChange={(e) => setLesson((l) => ({ ...l, unit: e.target.value || undefined }))} />
            {lesson.example && <span>· example</span>}
          </div>
          <input className="topic" value={lesson.topic} onChange={(e) => setLesson((l) => ({ ...l, topic: e.target.value }))} aria-label="Topic" />
          <input className="input" style={{ border: 0, padding: 0, background: "transparent", color: "var(--mute)" }} placeholder="One-line summary for the Classes page…" value={lesson.summary} onChange={(e) => setLesson((l) => ({ ...l, summary: e.target.value }))} />
        </div>
        <div className="row">
          {drafts.length > 1 && (
            <select className="select" style={{ width: "auto" }} value={lesson.id} onChange={(e) => { setLessonId(e.target.value); setSel(null); router.replace(`/prep?lesson=${e.target.value}`); }}>
              {drafts.map((d) => <option key={d.id} value={d.id}>Class {d.number}: {d.topic}</option>)}
            </select>
          )}
          <button className="btn ghost" onClick={() => setCreating(true)}>+ New class</button>
        </div>
      </div>

      <div className="bench">
        <aside className="drawer">
          <div className="dtabs" role="tablist">
            {(["research", "textbook", "exhibits", "library", "files"] as const).map((t) => (
              <button key={t} role="tab" className="dtab mono" aria-selected={tab === t} onClick={() => setTab(t)}>
                {t === "files" ? "My images" : t}
              </button>
            ))}
          </div>
          <div className="dbody">
            <div className={tab === "research" ? "" : "hide"}><ResearchPanel lesson={lesson} onSearchExhibit={(q) => { setExQ(q); setTab("exhibits"); }} /></div>
            <div className={tab === "textbook" ? "" : "hide"}><TextbookPanel books={books} /></div>
            <div className={tab === "exhibits" ? "" : "hide"}><ExhibitsPanel q={exQ} setQ={setExQ} onAdd={(a) => slide && setSlide(slide.id, (s) => addTo(s, { kind: "artwork", artwork: a }))} /></div>
            <div className={tab === "library" ? "" : "hide"}>
              <LibraryPanel lesson={lesson} resources={resources} toggle={(id) => setLesson((l) => ({ ...l, readings: l.readings.includes(id) ? l.readings.filter((x) => x !== id) : [...l.readings, id] }))} />
            </div>
            <div className={tab === "files" ? "" : "hide"}><FilesPanel /></div>
          </div>
        </aside>

        <section>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <span className="mono mute">Slide {slide ? lesson.slides.indexOf(slide) + 1 : 0} of {lesson.slides.length} — drop things on the slide to add them</span>
            <div className="row">
              <button className="btn" disabled={checking || st?.claude === false || !lesson.slides.length} onClick={() => check(false)} title="Checks slides changed since the last check">
                {checking ? "Checking… (1–2 min)" : "Fact-check deck"}
              </button>
              <button className="btn ghost" disabled={busyPptx || !lesson.slides.length} onClick={async () => { setBusyPptx(true); try { await downloadPptx(lesson); } finally { setBusyPptx(false); } }}>
                {busyPptx ? "Building…" : ".pptx"}
              </button>
            </div>
          </div>
          {checkErr && <div className="err" style={{ marginBottom: 12 }}>{checkErr}</div>}

          {slide ? (
            <div className={`stage ${over === "stage" ? "over" : ""}`} onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setOver("stage"); } }} onDragLeave={() => setOver(null)} onDrop={dropOnStage}>
              <SlideView s={slide} n={lesson.number} />
              <div className="edgrid">
                <div className="stack">
                  <div className="row">
                    <div className="grow"><label className="label mono">Title</label><input className="input" value={slide.title} onChange={(e) => edit({ title: e.target.value })} /></div>
                    <div><label className="label mono">Layout</label>
                      <select className="select" value={slide.layout} onChange={(e) => edit({ layout: e.target.value as Slide["layout"] })}>
                        <option value="title">Title</option><option value="text">Text</option><option value="artwork">Artwork</option><option value="compare">Compare two</option>
                      </select>
                    </div>
                  </div>
                  <div><label className="label mono">Points (one per line)</label><textarea className="area" style={{ minHeight: 120 }} value={slide.body} onChange={(e) => edit({ body: e.target.value })} /></div>
                  <div><label className="label mono">Speaker notes</label><textarea className="area" value={slide.notes} onChange={(e) => edit({ notes: e.target.value })} /></div>
                </div>
                <div className="stack">
                  <div>
                    <label className="label mono">Images</label>
                    {slide.images.length ? (
                      <div className="thumbs">
                        {slide.images.map((im, i) => (
                          <div key={i} className="t" title={im.credit}>
                            <div className="photo"><img src={im.url.startsWith("data:") ? im.url : proxied(im.url)} alt="" /></div>
                            <div className="mono" style={{ fontSize: 9, marginTop: 3 }}>{im.rights === "public-domain" ? "public domain" : im.rights === "own" ? "yours" : "rights: check"}</div>
                            <button className="btn sm solid" onClick={() => setSlide(slide.id, (s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))} aria-label="Remove image">×</button>
                          </div>
                        ))}
                      </div>
                    ) : <div className="drop">Drag an exhibit or your own image here</div>}
                  </div>
                  {slide.artworks.length > 0 && (
                    <div>
                      <label className="label mono">Caption (from the museum record)</label>
                      {slide.artworks.map((a) => <div key={a.id} className="src"><a href={a.url} target="_blank" rel="noreferrer">{caption(a)}</a></div>)}
                    </div>
                  )}
                  <div>
                    <label className="label mono">Sources</label>
                    {slide.sources.length ? slide.sources.map((s, i) => (
                      <div key={i} className="row src" style={{ flexWrap: "nowrap" }}>
                        <span className="grow">{/^https?:/.test(s.url) ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>
                        <button className="btn sm ghost" onClick={() => setSlide(slide.id, (x) => ({ ...x, sources: x.sources.filter((_, j) => j !== i) }))}>×</button>
                      </div>
                    )) : <p className="mute" style={{ margin: 0, fontSize: 13 }}>None yet. Facts dragged from Research, Textbook or Exhibits bring their sources.</p>}
                  </div>
                  <div>
                    <label className="label mono">Fact-check <span className={`v ${stateMark[ss]}`}>{stateText[ss]}</span></label>
                    {slide.check ? <Claims claims={slide.check.claims} /> : <p className="mute" style={{ margin: 0, fontSize: 13 }}>Changed since the last check (or never checked).</p>}
                  </div>
                  <div className="row">
                    <button className="btn sm ghost" onClick={() => { const c = { ...slide, id: uid(), check: undefined }; setSlides((x) => { const i = x.findIndex((y) => y.id === slide.id); const n = [...x]; n.splice(i + 1, 0, c); return n; }); setSel(c.id); }}>Duplicate</button>
                    <button className="btn sm ghost" onClick={() => { if (confirm("Delete this slide?")) { setSlides((x) => x.filter((y) => y.id !== slide.id)); setSel(null); } }}>Delete slide</button>
                  </div>
                </div>
              </div>
            </div>
          ) : <div className="empty">Drag something onto the strip below to make the first slide.</div>}
        </section>
      </div>

      <div className={`strip ${over === "strip" ? "over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver("strip"); }} onDragLeave={() => setOver(null)} onDrop={(e) => dropOnStrip(e)}>
        {lesson.slides.map((s, i) => {
          const state = slideState(s);
          return (
            <button key={s.id} className="fr" aria-selected={slide?.id === s.id} onClick={() => setSel(s.id)} draggable
              onDragStart={(e) => { e.dataTransfer.setData(FRAME, s.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropOnStrip(e, i); }}>
              <SlideView s={s} n={lesson.number} />
              <span className="n"><span>{String(i + 1).padStart(2, "0")}</span><span className={`v ${stateMark[state]}`}>{stateText[state]}</span></span>
            </button>
          );
        })}
        <button className="add" onClick={() => { const s = blankSlide("text"); setSlides((x) => [...x, s]); setSel(s.id); }}>+ Slide<br />or drop here</button>
      </div>

      <div className="readybar">
        <div className="row mono" style={{ gap: 18 }}>
          <span className={`v ${r.problems ? "bad" : "ok"}`}>{r.problems} to fix</span>
          <span className={`v ${r.unchecked ? "todo" : "ok"}`}>{r.unchecked} not checked</span>
          <span className={`v ${r.unverified ? "unv" : "ok"}`}>{r.unverified} unverified</span>
          {r.rights > 0 && <span className="mute">{r.rights} image(s): rights to check</span>}
        </div>
        <div className="row">
          {!r.ok && <span className="mute" style={{ fontSize: 13 }}>{r.problems ? "Fix the ✗ facts first." : r.unchecked ? "Run the fact-check first." : "Add a slide first."}</span>}
          <button className="btn solid" disabled={!r.ok}
            onClick={() => {
              if (r.unverified && !confirm(`${r.unverified} slide(s) still have facts no source could confirm. You've checked these yourself?`)) return;
              setLesson((l) => ({ ...l, status: "ready", readyAt: new Date().toISOString() }));
              router.push("/classes");
            }}>
            Ready for class →
          </button>
        </div>
      </div>
      <p className="mute" style={{ fontSize: 12, marginTop: 10 }}>Finished classes live in <Link href="/classes">Classes</Link>. Everything you type is saved automatically{st?.db ? " and shared across your devices" : " in this browser"}.</p>
    </main>
  );
}
