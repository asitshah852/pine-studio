"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCollection } from "@/lib/client";
import { downloadPptx } from "@/lib/pptx";
import { SEED_LESSONS } from "@/lib/seed";
import { deckSources, readiness } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
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
  }, [n, close]);
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

export default function Classes() {
  const { items: lessons, update } = useCollection<Lesson>("lessons", SEED_LESSONS);
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [open, setOpen] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState(false);

  const ready = lessons.filter((l) => l.status === "ready").sort((a, b) => a.number - b.number);
  const drafts = lessons.filter((l) => l.status === "draft").sort((a, b) => a.number - b.number);
  const units = Array.from(new Set(ready.map((l) => l.unit || "Other")));
  const lesson = lessons.find((l) => l.id === open);

  if (lesson) {
    const r = readiness(lesson);
    const src = deckSources(lesson.slides);
    const reads = resources.filter((x) => lesson.readings.includes(x.id));
    return (
      <main className="page">
        {presenting && <Present lesson={lesson} close={() => setPresenting(false)} />}
        <button className="btn ghost sm" onClick={() => setOpen(null)}>← All classes</button>
        <div className="head" style={{ marginTop: 18 }}>
          <div>
            <div className="mono mute">Class {String(lesson.number).padStart(2, "0")} {lesson.date && `· ${lesson.date}`} {lesson.unit && `· ${lesson.unit}`} {lesson.example && "· Example"}</div>
            <h1>{lesson.topic}</h1>
            <p>{lesson.summary}</p>
          </div>
          <div className="row">
            <button className="btn solid" onClick={() => setPresenting(true)} disabled={!lesson.slides.length}>Present</button>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await downloadPptx(lesson); } finally { setBusy(false); } }}>{busy ? "Building…" : "Download .pptx"}</button>
            <Link className="btn ghost" href={`/prep?lesson=${lesson.id}`}>Edit in Prep</Link>
            {lesson.status === "ready" && (
              <button className="btn ghost" onClick={() => { update((cur) => cur.map((l) => (l.id === lesson.id ? { ...l, status: "draft" } : l))); setOpen(null); }}>Move back to Prep</button>
            )}
          </div>
        </div>
        <div className="row mono" style={{ marginBottom: 18, gap: 18 }}>
          <span className={`v ${r.problems ? "bad" : r.unchecked ? "todo" : r.unverified ? "unv" : "ok"}`}>
            {r.problems ? `${r.problems} slide(s) with errors` : r.unchecked ? `${r.unchecked} slide(s) not checked` : r.unverified ? `${r.unverified} slide(s) with unverified facts` : "Fact-checked"}
          </span>
          {lesson.checkedAt && <span className="mute">checked {lesson.checkedAt.slice(0, 10)}</span>}
          {r.rights > 0 && <span className="mute">{r.rights} image(s): rights to check</span>}
        </div>
        <div className="sheet">
          {lesson.slides.map((s, i) => (
            <div key={s.id}>
              <SlideView s={s} n={lesson.number} />
              <div className="row mono mute" style={{ marginTop: 6, justifyContent: "space-between" }}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {s.notes && <span title={s.notes}>notes ✎</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ alignItems: "start", gap: 36, marginTop: 40 }}>
          <section className="grow">
            <h2>Readings</h2>
            {reads.length ? reads.map((x) => <div key={x.id} className="src">{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title} {x.author && `— ${x.author}`}</div>) : <p className="mute">None linked.</p>}
          </section>
          <section className="grow">
            <h2>Sources</h2>
            {src.length ? src.map((s) => <div key={s.url} className="src"><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></div>) : <p className="mute">No sources recorded.</p>}
          </section>
        </div>
      </main>
    );
  }

  const card = (l: Lesson) => (
    <button key={l.id} className="lesson" onClick={() => setOpen(l.id)}>
      {l.slides[0] ? <SlideView s={l.slides[0]} n={l.number} /> : <div className="slide"><div className="ph">No slides yet</div></div>}
      <div className="meta mono mute">
        <span>Class {String(l.number).padStart(2, "0")}{l.date ? ` · ${l.date}` : ""}</span>
        <span>{l.slides.length} slides{l.example ? " · example" : ""}</span>
      </div>
      <h3>{l.topic}</h3>
      <div className="src">{l.summary}</div>
    </button>
  );

  return (
    <main className="page">
      <div className="head">
        <div>
          <h1>Classes</h1>
          <p>Finished, fact-checked class materials by unit. Open one to present it, download the PowerPoint, or send it back to Prep.</p>
        </div>
        <Link className="btn solid" href="/prep?new=1">+ Prepare a new class</Link>
      </div>
      {!ready.length && <div className="empty">No finished classes yet. Build one in Prep and press “Ready for class”.</div>}
      {units.map((u) => (
        <section key={u} style={{ marginBottom: 48 }}>
          <div className="mono mute" style={{ borderBottom: "1px solid var(--ink)", paddingBottom: 8, marginBottom: 18 }}>{u}</div>
          <div className="sheet">{ready.filter((l) => (l.unit || "Other") === u).map(card)}</div>
        </section>
      ))}
      {drafts.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div className="mono mute" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 18 }}>In prep</div>
          <div className="row">
            {drafts.map((l) => (
              <Link key={l.id} href={`/prep?lesson=${l.id}`} className="btn ghost">Class {l.number}: {l.topic}</Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
