"use client";
// Import classes she has already taught: a zip downloaded from Google Drive, a whole folder from her
// computer, or a few files. Each presentation becomes a ready class (her slides and speaker notes as
// they are, in pine kitchen's look); handouts in the same folder come along as class materials.
// She sees the list first, edits titles, unticks anything, then imports.
import { useRef, useState } from "react";
import { load, uid, useStatus } from "@/lib/client";
import { group, problem, unpack, type Proposal } from "@/lib/folderImport";
import { runJob } from "@/lib/jobs";
import { runTalking } from "@/lib/make";
import { useStudio } from "@/lib/studio";
import type { Course, Lesson } from "@/lib/types";
import { importAll } from "./Improve";
import Working from "./Working";

type Item = { file: File; folder: string };

export default function FolderImport({ course, close }: { course: Course; close: () => void }) {
  const st = useStatus();
  const { lessons, updateLessons } = useStudio();
  const [items, setItems] = useState<Item[]>([]);
  const [props, setProps] = useState<Proposal[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [talk, setTalk] = useState(true);
  const [done, setDone] = useState<{ made: number; errors: string[] } | null>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const existing = lessons.filter((l) => l.courseId === course.id);
  const start = Math.max(0, ...existing.map((l) => l.number));

  async function take(files: File[]) {
    if (!files.length) return;
    setDone(null);
    setBusy("Opening your files…");
    try {
      const all = await unpack(files, setBusy);
      setItems(all);
      setProps(group(all.map((x) => ({ name: x.file.name, folder: x.folder }))));
      setSkipped(all.map((x) => (problem(x.file.name) ? `${x.folder ? `${x.folder}/` : ""}${x.file.name}: ${problem(x.file.name)}` : "")).filter(Boolean));
    } catch (e) {
      setSkipped([`Couldn't open that: ${(e as Error).message}`]);
    }
    setBusy("");
  }

  async function run() {
    const chosen = props.filter((p) => p.use);
    const made: Lesson[] = [];
    const errors: string[] = [];
    let n = start;
    for (const [k, p] of chosen.entries()) {
      setBusy(`Importing ${k + 1} of ${chosen.length}: ${p.title}`);
      const r = await importAll(p.files.map((i) => items[i].file), (s) => setBusy(`Importing ${k + 1} of ${chosen.length}: ${p.title} — ${s}`));
      errors.push(...r.errors);
      if (!r.slides.length && !r.materials.length) continue;
      const l: Lesson = { id: uid(), courseId: course.id, number: ++n, topic: p.title.trim() || "Untitled class", premise: "", readings: [], slides: r.slides, materials: r.materials, status: "ready", readyAt: new Date().toISOString() };
      made.push(l);
      updateLessons((cur) => [...cur, l]);
    }
    setBusy("");
    setDone({ made: made.length, errors });
    setProps([]);
    setItems([]);
    // Draft talking points for slides that have none, one class after another (runs while a page is open).
    if (talk && st?.claude !== false)
      (async () => {
        for (const l of made) {
          const now = load<Lesson[]>("pine.lessons", []).find((x) => x.id === l.id) ?? l;
          if (!now.slides.some((s) => !s.notes.trim())) continue;
          await runJob(`talk:${l.id}`, async () => { await runTalking(now, (fn) => updateLessons((cur) => cur.map((x) => (x.id === l.id ? fn(x) : x)))); });
        }
      })();
  }

  const ticked = props.filter((p) => p.use).length;
  return (
    <div className="existing folderimport">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ fontWeight: 500 }}>import classes you’ve already taught</b>
        <button className="linkish" onClick={close}>close</button>
      </div>
      {!props.length && !busy && !done && (
        <>
          <p className="mute" style={{ margin: 0 }}>From Google Drive: right-click the folder → <b>Download</b>, then drop the zip here. Or choose a folder or files from your computer. Each presentation becomes a class; handouts in the same folder go with it.</p>
          <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(Array.from(e.dataTransfer.files)); }}>
            drop the zip, PowerPoints, PDFs or Word files here
            <input ref={zipRef} type="file" multiple accept=".zip,.pptx,.pdf,.docx,.txt,.md" className="hide" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; take(f); }} />
          </label>
          <div className="row">
            <button className="btn" onClick={() => zipRef.current?.click()}>choose files</button>
            <button className="btn ghost" onClick={() => dirRef.current?.click()}>choose a folder</button>
            <input ref={dirRef} type="file" multiple className="hide" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; take(f); }} />
          </div>
        </>
      )}
      {busy && <Working what="Bringing in your classes" doing={busy} usual="a few seconds per presentation" />}
      {props.length > 0 && !busy && (
        <>
          <p className="mute" style={{ margin: 0 }}>{props.length} found. Untick anything that isn’t a class; click a title to change it. They’ll be numbered {start + 1} onwards in {course.name}.</p>
          <ol className="importlist">
            {props.map((p, k) => (
              <li key={k} className={p.use ? "" : "off"}>
                <input type="checkbox" checked={p.use} onChange={() => setProps(props.map((x, j) => (j === k ? { ...x, use: !x.use } : x)))} aria-label="import this class" />
                <span className="mono mute" style={{ width: 28, paddingTop: 6 }}>{p.use ? String(start + props.slice(0, k + 1).filter((x) => x.use).length).padStart(2, "0") : ""}</span>
                <div className="grow">
                  <input className="plantopic" value={p.title} onChange={(e) => setProps(props.map((x, j) => (j === k ? { ...x, title: e.target.value } : x)))} aria-label="class title" />
                  <div className="mute small">
                    {p.folder && <>{p.folder} · </>}
                    {p.files.map((i) => items[i].file.name).join(" + ")}
                    {p.deck === undefined && " · no slides"}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={talk} onChange={() => setTalk(!talk)} /> then draft talking points for slides that have none (you can edit them)</label>
          <div className="row">
            <button className="btn solid" disabled={!ticked} onClick={run}>import {ticked} class{ticked === 1 ? "" : "es"}</button>
            <button className="linkish" onClick={() => { setProps([]); setItems([]); setSkipped([]); }}>start again</button>
          </div>
        </>
      )}
      {skipped.length > 0 && (
        <details className="srcs"><summary className="mute">{skipped.length} file{skipped.length === 1 ? "" : "s"} couldn’t be read</summary><ul>{skipped.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
      )}
      {done && (
        <div className="stack">
          <p style={{ margin: 0 }}>✓ {done.made} class{done.made === 1 ? "" : "es"} imported as ready.{talk && done.made ? " Talking points are being drafted in the background — keep a pine kitchen page open for a few minutes." : ""}</p>
          {done.errors.length > 0 && <details className="srcs"><summary className="mute">{done.errors.length} problem{done.errors.length === 1 ? "" : "s"}</summary><ul>{done.errors.map((x, i) => <li key={i}>{x}</li>)}</ul></details>}
          <div><button className="btn" onClick={close}>done</button></div>
        </div>
      )}
    </div>
  );
}
