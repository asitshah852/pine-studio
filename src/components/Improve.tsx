"use client";
// "Suggest improvements" for a class she has already taught, plus her uploaded materials.
import { useEffect, useRef, useState } from "react";
import { apiJob, proxied, useStatus } from "@/lib/client";
import { loadText } from "@/lib/files";
import { ACCEPT, importFile } from "@/lib/importers";
import { applySuggestion, discussionSlide } from "@/lib/slides";
import { pad } from "@/lib/studio";
import Working from "./Working";
import Versions from "./Versions";
import { forget, useJob } from "@/lib/jobs";
import { withReview } from "@/lib/lessonOps";
import type { Lesson, Material, ReviewDoc, Slide, Suggestion } from "@/lib/types";

const KIND: Record<Suggestion["kind"], string> = {
  accuracy: "accuracy",
  content: "content",
  discussion: "discussion",
  exhibit: "exhibit",
  structure: "structure",
  clarity: "clarity",
};

/** Import files; returns new slides + material records. Used by Classes and Prep. */
export async function importAll(files: File[], onProgress: (s: string) => void) {
  const slides: Slide[] = [];
  const materials: Material[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      onProgress(`Reading ${f.name}…`);
      const r = await importFile(f, (s) => onProgress(`${f.name}: ${s}`));
      slides.push(...r.slides);
      materials.push(r.material);
    } catch (e) {
      errors.push((e as Error).message || `${f.name}: couldn't be read.`);
    }
  }
  return { slides, materials, errors };
}

export function UploadButton({ label, onFiles, busy }: { label: string; onFiles: (f: File[]) => void; busy?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" multiple accept={ACCEPT} className="hide" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onFiles(f); }} />
      <button type="button" className="btn ghost" disabled={!!busy} onClick={() => ref.current?.click()}>{busy || label}</button>
    </>
  );
}

export default function Improve({ lesson, course, set, autoRun }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; autoRun?: boolean }) {
  const st = useStatus();
  const job = useJob(`review:${lesson.id}`);
  const busy = job.running;
  const [uploading, setUploading] = useState("");
  const [upErr, setErr] = useState("");
  const err = upErr || job.error;
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<number[]>([]);
  const started = useRef(false);
  const rv = lesson.review;
  const mats = lesson.materials ?? [];
  const setReview = (fn: (r: ReviewDoc) => ReviewDoc) => set((l) => (l.review ? { ...l, review: fn(l.review) } : l));

  async function run() {
    if (rv && !confirm("Replace the current suggestions with a fresh review?")) return;
    setErr("");
    job.clearError();
    await job.run(async () => {
      const materials = await Promise.all(mats.map(async (m) => ({ name: m.name, text: await loadText(m.fileId, m.preview) })));
      const r = await apiJob<ReviewDoc>("/api/review", {
          course,
          number: lesson.number,
          topic: lesson.topic,
          premise: lesson.premise,
          slides: lesson.slides.map((s) => ({ id: s.id, title: s.title, body: s.body, notes: s.notes })),
          materials,
          jobKey: `review:${lesson.id}`,
      });
      set((l) => withReview(l, r));
      forget(`review:${lesson.id}`);
    });
  }

  useEffect(() => {
    if (autoRun && !started.current && st?.claude && !rv && !busy && (lesson.slides.length || mats.length)) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, st]);

  async function upload(files: File[]) {
    setErr("");
    const r = await importAll(files, setUploading);
    setUploading("");
    if (r.errors.length) setErr(r.errors.join(" "));
    set((l) => ({ ...l, slides: [...l.slides, ...r.slides], materials: [...(l.materials ?? []), ...r.materials] }));
  }

  async function toggleMat(m: Material) {
    if (open === m.id) return setOpen(null);
    setOpen(m.id);
    if (!full[m.id]) setFull({ ...full, [m.id]: await loadText(m.fileId, m.preview) });
  }

  const slideName = (id?: string) => {
    const i = lesson.slides.findIndex((s) => s.id === id);
    return i >= 0 ? `slide ${pad(i + 1)}${lesson.slides[i].title ? ` · ${lesson.slides[i].title}` : ""}` : "";
  };
  const openS = rv?.suggestions.filter((s) => s.status === "open") ?? [];
  const doneS = rv?.suggestions.filter((s) => s.status !== "open") ?? [];

  return (
    <section className="improve">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Suggest improvements</h2>
        <div className="row">
          <Versions lesson={lesson} kind="review" set={set} />
          <UploadButton label="+ add materials" onFiles={upload} busy={uploading} />
          <button className="btn solid" disabled={busy || st?.claude === false || (!lesson.slides.length && !mats.length)} onClick={run}>
            {busy ? "reviewing…" : rv ? "review again" : "suggest improvements"}
          </button>
        </div>
      </div>
      <p className="mute" style={{ marginTop: 6 }}>
        Reads your {lesson.slides.length} slide(s){mats.length ? ` and ${mats.length} file(s)` : ""}, checks the facts, and suggests changes, new discussion points and exhibits. You choose what to keep.
      </p>
      {busy && <Working since={job.started} what="Reviewing your class" doing="Reading your slides and materials, checking the facts, and finding discussion points and museum exhibits" usual="2–3 minutes" />}
      {uploading && <Working what="Bringing in your files" doing={uploading} usual="a few seconds per file" />}
      {err && <div className="err">{err}</div>}

      {mats.length > 0 && (
        <div className="mats">
          <div className="mono mute">your materials</div>
          {mats.map((m) => (
            <div key={m.id} className="mat">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <button className="linkish" style={{ color: "var(--ink)", textDecoration: "none" }} onClick={() => toggleMat(m)}>
                  {m.name} <span className="mute">· {m.kind}{m.slides ? ` · ${m.slides} slides imported` : ""} · {open === m.id ? "hide" : "read"}</span>
                </button>
                <button className="btn sm ghost" onClick={() => confirm(`Remove ${m.name} from this class? (Slides already imported stay.)`) && set((l) => ({ ...l, materials: (l.materials ?? []).filter((x) => x.id !== m.id) }))}>remove</button>
              </div>
              {open === m.id && <pre className="mattext">{full[m.id] ?? "Loading…"}</pre>}
            </div>
          ))}
        </div>
      )}

      {rv && (
        <div className="stack" style={{ marginTop: 20 }}>
          {rv.summary && <p className="lead" style={{ margin: 0 }}>{rv.summary}</p>}
          {openS.map((s) => (
            <div key={s.id} className="sg">
              <div className="mono mute">{KIND[s.kind]}{s.slideId ? ` · ${slideName(s.slideId)}` : ""}</div>
              <div>{s.text}</div>
              {s.change && (
                <div className="proposal">
                  {s.change.title && <div><span className="mute">title → </span>{s.change.title}</div>}
                  {s.change.body && <div style={{ whiteSpace: "pre-wrap" }}><span className="mute">points → </span>{s.change.body}</div>}
                  {s.change.notes && <div><span className="mute">notes → </span>{s.change.notes}</div>}
                </div>
              )}
              {s.newSlide && (
                <div className="proposal">
                  <span className="mute">new slide → </span><b style={{ fontWeight: 500 }}>{s.newSlide.title}</b>
                  {s.newSlide.body && <div style={{ whiteSpace: "pre-wrap" }}>{s.newSlide.body}</div>}
                </div>
              )}
              <div className="src">
                {s.sources.map((x, i) => <span key={i}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></span>)}
                {!s.verified && <span className="v bad"> no source found — check before changing anything</span>}
              </div>
              <div className="row">
                {(s.change || s.newSlide) && (
                  <button className="btn sm solid" onClick={() => {
                    if (!s.verified && !confirm("No source backs this correction. Apply it anyway?")) return;
                    set((l) => ({ ...l, slides: applySuggestion(l.slides, s), review: l.review && { ...l.review, suggestions: l.review.suggestions.map((x) => (x.id === s.id ? { ...x, status: "applied" } : x)) } }));
                  }}>{s.change ? "apply change" : "add slide"}</button>
                )}
                <button className="btn sm ghost" onClick={() => setReview((r) => ({ ...r, suggestions: r.suggestions.map((x) => (x.id === s.id ? { ...x, status: (s.change || s.newSlide) ? "dismissed" : "applied" } : x)) }))}>
                  {s.change || s.newSlide ? "dismiss" : "noted"}
                </button>
              </div>
            </div>
          ))}
          {!openS.length && rv.suggestions.length > 0 && <p className="mute">All suggestions dealt with.</p>}

          {rv.questions.length > 0 && (
            <div>
              <h3 className="h">New discussion points</h3>
              {rv.questions.map((q, i) => (
                <label key={i} className="row" style={{ flexWrap: "nowrap", alignItems: "start", marginBottom: 6 }}>
                  <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
                  <span>{q}</span>
                </label>
              ))}
              <button className="btn sm" disabled={!picked.length} onClick={() => { set((l) => ({ ...l, slides: [...l.slides, discussionSlide(picked.map((i) => rv.questions[i]))] })); setPicked([]); }}>
                add a discussion slide with these
              </button>
            </div>
          )}

          {rv.exhibits.length > 0 && (
            <div>
              <h3 className="h">Exhibits to consider</h3>
              <p className="mute" style={{ margin: "0 0 10px" }}>Tick to make them available in the Slides step.</p>
              <div className="stack">
                {rv.exhibits.map((e) => (
                  <div key={e.id} className="sugg">
                    <div className="photo">{e.match?.thumbUrl ? <img src={proxied(e.match.thumbUrl)} alt="" loading="lazy" /> : null}</div>
                    <div>
                      {e.match ? (
                        <label className="row" style={{ flexWrap: "nowrap", alignItems: "start", gap: 8 }}>
                          <input type="checkbox" checked={e.use} onChange={() => setReview((r) => ({ ...r, exhibits: r.exhibits.map((x) => (x.id === e.id ? { ...x, use: !x.use } : x)) }))} />
                          <b>{e.match.title}</b>
                        </label>
                      ) : <b>{e.suggested}</b>}
                      <div className="src">{e.match ? `${e.match.artist.split("\n")[0]}${e.match.date ? `, ${e.match.date}` : ""}` : "Not found in the open collections."}</div>
                      {e.why && <div>{e.why}</div>}
                      {e.match && <div className="src"><a href={e.match.url} target="_blank" rel="noreferrer">{e.match.museum} ↗</a> · {e.match.video ? `YouTube · ${e.match.video.channel}` : e.match.publicDomain ? "free to use" : "rights: check"}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {doneS.length > 0 && (
            <details>
              <summary className="mute">{doneS.length} suggestion(s) applied or dismissed</summary>
              {doneS.map((s) => (
                <div key={s.id} className="row src" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <span>{s.status === "applied" ? "✓" : "–"} {s.text}</span>
                  <button className="btn sm ghost" onClick={() => setReview((r) => ({ ...r, suggestions: r.suggestions.map((x) => (x.id === s.id ? { ...x, status: "open" } : x)) }))}>reopen</button>
                </div>
              ))}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
