"use client";
// Student handout: summary, works to look at (with captions and links), discussion questions and
// numbered sources. Opens the print dialog so she can "Save as PDF" and post it for students.
import { useEffect, useMemo, useRef } from "react";
import { proxied } from "@/lib/client";
import { caption } from "@/lib/museum";
import { pad, useStudio } from "@/lib/studio";
import type { Artwork } from "@/lib/types";

export default function Handout({ id }: { id: string }) {
  const { ready, lessons, courseName } = useStudio();
  const l = lessons.find((x) => x.id === id);
  const printed = useRef(false);

  const works = useMemo(() => {
    if (!l) return [] as Artwork[];
    const all = [...l.slides.flatMap((s) => s.artworks), ...(l.research?.exhibits ?? []).filter((e) => e.use && e.match).map((e) => e.match!)];
    return all.filter((a, i) => all.findIndex((b) => b.url === a.url) === i);
  }, [l]);

  // Numbered sources, in the order they appear.
  const refs = useMemo(() => {
    const list: { title: string; url: string }[] = [];
    const num = new Map<string, number>();
    for (const s of l?.research?.sections ?? []) for (const p of s.paragraphs) for (const src of p.sources) if (!num.has(src.url)) { list.push(src); num.set(src.url, list.length); }
    return { list, num };
  }, [l]);

  useEffect(() => {
    if (!l || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(t);
  }, [l]);

  if (!ready) return <main className="handout"><p>Loading…</p></main>;
  if (!l) return <main className="handout"><p>Class not found.</p></main>;
  const doc = l.research;

  return (
    <main className="handout">
      <div className="noprint row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <span className="mute">Student handout — use “Save as PDF” in the print window.</span>
        <button className="btn solid" onClick={() => window.print()}>print / save as PDF</button>
      </div>
      <div className="mono mute">{courseName(l.courseId)} · class {pad(l.number)}</div>
      <h1>{l.topic}</h1>
      {l.premise && <p className="lead">{l.premise}</p>}
      {doc?.overview && <p>{doc.overview}</p>}

      {doc && doc.sections.length > 0 && (
        <>
          <h2>Key ideas</h2>
          {doc.sections.map((s) => (
            <section key={s.id}>
              <h3>{s.heading}</h3>
              {s.paragraphs.map((p) => (
                <p key={p.id}>
                  {p.text}
                  {p.sources.length > 0 && <sup> [{p.sources.map((x) => refs.num.get(x.url)).join(", ")}]</sup>}
                </p>
              ))}
            </section>
          ))}
        </>
      )}

      {works.length > 0 && (
        <>
          <h2>Look closely</h2>
          <div className="hworks">
            {works.map((a) => (
              <figure key={a.url}>
                {a.thumbUrl && <img src={proxied(a.thumbUrl)} alt={caption(a)} />}
                <figcaption>
                  {caption(a)} <br />
                  <a href={a.url}>{a.video ? "Watch on YouTube" : `See it at ${a.museum}`}</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {doc && doc.questions.length > 0 && (
        <>
          <h2>Think about</h2>
          <ol>{doc.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </>
      )}

      {refs.list.length > 0 && (
        <>
          <h2>Sources</h2>
          <ol className="hsrc">{refs.list.map((s, i) => <li key={i}>{s.title} — <a href={s.url}>{s.url}</a></li>)}</ol>
        </>
      )}
    </main>
  );
}
