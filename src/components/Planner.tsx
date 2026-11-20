"use client";
// Semester planner for one course. She talks the plan through with Claude (it follows her
// instructions carefully: searches other colleges' course pages, reads her prescribed textbooks and
// uploaded documents, and edits the list of classes). She edits and ticks; "add" creates the classes,
// "add & make" also builds each one in turn — with pause and stop.
import { useEffect, useRef, useState } from "react";
import { apiJob, load, uid, useCollection, useStatus } from "@/lib/client";
import { forget, recover, useJob, wasCancelled } from "@/lib/jobs";
import { clearQueue, pauseQueue, queued, resumeQueue, saveQueue, startQueue, stopQueue, useMakeQueue } from "@/lib/makeQueue";
import { STARTER_RESOURCES } from "@/lib/starter";
import { useStudio } from "@/lib/studio";
import { pdfUrl } from "@/lib/textbooks";
import type { ChatMessage, Course, Lesson, Plan, PlanItem, Resource, Source } from "@/lib/types";
import { importAll, UploadButton } from "./Improve";
import Rich from "./Rich";
import Working from "./Working";

type Reply = { reply: string; sources: Source[]; items: PlanItem[]; changes: string[]; changed: boolean };

const STARTERS = [
  "Look at how City Colleges of Chicago and other colleges teach this course, and build me an outline",
  "Follow the chapters of the textbook I chose, one or two chapters a week",
  "Put a review class before the midterm and the final",
];

const blank = (): Plan => ({ at: new Date().toISOString(), weeks: 16, perWeek: 2, themes: "", items: [] });
const lessonsNow = () => load<Lesson[]>("pine.lessons", []);

/** Making-classes progress with pause / resume / stop. Shown on Classes and in the planner. */
/** With a courseId it only speaks about that course's classes (and stays silent otherwise). */
export function QueueControls({ courseId }: { courseId?: string }) {
  const q = useMakeQueue();
  const { lessons, updateLessons, courseName } = useStudio();
  const [waiting, setWaiting] = useState<string[]>([]);
  useEffect(() => setWaiting(queued()), [q.running]);
  const cur = lessons.find((l) => l.id === q.current);
  const mine = (id: string) => !courseId || lessons.some((l) => l.id === id && l.courseId === courseId);
  if (q.running && (!courseId || (cur && cur.courseId === courseId)))
    return (
      <div className="queuebar">
        <Working what={`Making your classes — ${q.left} to go${q.paused ? " (paused)" : ""}`} doing={cur ? `Now: class ${cur.number}, ${cur.topic}. Research, slides and fact-check for each class in turn` : "Research, slides and fact-check for each class in turn"} usual="4–6 minutes per class" />
        <div className="row">
          {q.stopping ? <span className="mute">stopping after this step…</span> : q.paused ? <button className="btn" onClick={resumeQueue}>resume</button> : <button className="btn" onClick={pauseQueue} title="Pauses after the step that's running now">pause</button>}
          {!q.stopping && <button className="btn" onClick={() => confirm("Stop making classes? Classes already made (and the step running now) are kept; the rest stay in prep, unmade.") && stopQueue()}>stop</button>}
        </div>
      </div>
    );
  if (q.running) return null;
  const left = waiting.filter((id) => mine(id) && lessons.some((l) => l.id === id && !(l.research && l.slides.length)));
  if (!left.length) return null;
  return (
    <div className="row queuebar">
      <span>{left.length} planned class{left.length === 1 ? " is" : "es are"} still to be made.</span>
      <button className="btn" onClick={() => {
        // this course's classes first; any others queued stay behind them
        saveQueue([...left, ...queued().filter((id) => !left.includes(id))]);
        startQueue([], (id) => lessonsNow().find((l) => l.id === id), (id, fn) => updateLessons((c) => c.map((l) => (l.id === id ? fn(l) : l))), (l) => courseName(l.courseId));
      }}>carry on making them</button>
      <button className="linkish" onClick={() => { const rest = queued().filter((id) => !left.includes(id)); if (rest.length) saveQueue(rest); else clearQueue(); setWaiting(rest); }}>not now</button>
    </div>
  );
}

export default function Planner({ course, close }: { course: Course; close: () => void }) {
  const st = useStatus();
  const { lessons, updateCourses, updateLessons } = useStudio();
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const q = useMakeQueue();
  const plan = course.plan ?? blank();
  const existing = lessons.filter((l) => l.courseId === course.id).sort((a, b) => a.number - b.number);
  const made = (l: Lesson) => !!(l.research || l.slides.length || l.materials?.length);
  const [weeks, setWeeks] = useState(plan.weeks);
  const [perWeek, setPerWeek] = useState(plan.perWeek);
  const [minutes, setMinutes] = useState<number | undefined>(plan.minutes ?? existing.find((l) => l.minutes)?.minutes ?? 75);
  const [text, setText] = useState("");
  const [upl, setUpl] = useState("");
  const key = `planchat:${course.id}`;
  const job = useJob(key);
  const end = useRef<HTMLDivElement>(null);

  const setPlan = (fn: (p: Plan) => Plan) => updateCourses((cur) => cur.map((c) => (c.id === course.id ? { ...c, plan: fn(c.plan ?? blank()) } : c)));
  const setItem = (id: string, patch: Partial<PlanItem>) => setPlan((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

  // Her course sources: stored textbooks from the Library + documents uploaded here.
  const books = resources.filter((r) => r.pdf?.textId);
  const sources = [
    ...books.map((r) => ({ id: r.id, title: r.title, kind: "textbook" as const, textId: r.pdf!.textId, link: pdfUrl(r.pdf!.path) })),
    ...(plan.docs ?? []).map((m) => ({ id: m.id, title: m.name, kind: "document" as const, textId: m.fileId })),
  ];
  const use = plan.use ?? [];

  const apply = (r: Reply) =>
    setPlan((p) => ({
      ...p,
      at: new Date().toISOString(),
      weeks, perWeek, minutes,
      undo: r.changed ? p.items : p.undo,
      items: r.changed ? r.items : p.items,
      chat: [...(p.chat ?? []), { id: uid(), role: "assistant" as const, text: r.reply, at: new Date().toISOString(), sources: r.sources, ops: r.changes }].slice(-40),
    }));

  useEffect(() => {
    recover(key, (data) => apply(data as Reply));
  }, [course.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [plan.chat?.length, job.running]);

  function send(message: string) {
    const m = message.trim();
    if (!m || job.running) return;
    setText("");
    const history = (plan.chat ?? []).slice(-12).map((x) => ({ role: x.role, text: x.text }));
    setPlan((p) => ({ ...p, weeks, perWeek, minutes, chat: [...(p.chat ?? []), { id: uid(), role: "user" as const, text: m, at: new Date().toISOString() }].slice(-40) }));
    const started = Date.now();
    job.run(async () => {
      const r = await apiJob<Reply>("/api/planchat", {
        course: course.name, weeks, perWeek, minutes,
        existing: existing.map((l) => ({ number: l.number, topic: l.topic, made: made(l) })),
        items: plan.items, sources, use, history, message: m, jobKey: key,
      });
      if (wasCancelled(key, started)) return;
      apply(r);
      forget(key);
    });
  }

  async function addDocs(files: File[]) {
    const r = await importAll(files, setUpl);
    setUpl("");
    if (r.errors.length) alert(r.errors.join("\n"));
    if (r.materials.length) setPlan((p) => ({ ...p, docs: [...(p.docs ?? []), ...r.materials], use: [...(p.use ?? []), ...r.materials.map((m) => m.id)] }));
  }

  const ticked = plan.items.filter((x) => x.use);
  const unmade = existing.filter((l) => !made(l));
  function add(makeThem: boolean, replace = false) {
    const keep = replace ? existing.filter(made) : existing;
    let n = Math.max(0, ...keep.map((l) => l.number));
    const fresh: Lesson[] = ticked.map((x) => ({ id: uid(), courseId: course.id, number: ++n, topic: x.topic.trim(), premise: x.premise.trim(), minutes, readings: [], slides: [], status: "draft" }));
    const drop = new Set(replace ? unmade.map((l) => l.id) : []);
    if (replace && !confirm(`Replace your ${unmade.length} class(es) that haven't been made yet with these ${fresh.length}? Classes you've made are kept.`)) return;
    updateLessons((cur) => [...cur.filter((l) => !drop.has(l.id)), ...fresh]);
    setPlan((p) => ({ ...p, items: p.items.filter((x) => !x.use), undo: undefined }));
    if (makeThem) startQueue(fresh.map((l) => l.id), (id) => lessonsNow().find((l) => l.id === id) ?? fresh.find((l) => l.id === id), (id, fn) => updateLessons((cur) => cur.map((l) => (l.id === id ? fn(l) : l))), () => course.name);
  }

  const weeksList = [...new Set(plan.items.map((x) => x.week))].sort((a, b) => a - b);
  const last = [...(plan.chat ?? [])].reverse().find((m) => m.role === "assistant");
  return (
    <div className="planner">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b style={{ fontWeight: 500 }}>plan the semester</b>
        <button className="linkish" onClick={close}>close</button>
      </div>
      <div className="row" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <div style={{ width: 110 }}><label className="label">weeks</label><input className="input" type="number" min={1} max={18} value={weeks} onChange={(e) => setWeeks(Math.max(1, Math.min(18, Number(e.target.value) || 1)))} /></div>
        <div style={{ width: 150 }}><label className="label">classes a week</label>
          <select className="select" value={perWeek} onChange={(e) => setPerWeek(+e.target.value)}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div style={{ width: 160 }}><label className="label">class length</label>
          <select className="select" value={minutes ?? ""} onChange={(e) => setMinutes(Number(e.target.value) || undefined)}>
            <option value="">not set</option>{[50, 75, 100, 150].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select></div>
        <span className="mute">{weeks * perWeek} classes · {existing.filter(made).length} already made</span>
      </div>

      <div>
        <label className="label">base the plan on</label>
        <div className="srcchips">
          {sources.map((x) => (
            <label key={x.id} className={`srcchip ${use.includes(x.id) ? "on" : ""}`}>
              <input type="checkbox" checked={use.includes(x.id)} onChange={() => setPlan((p) => ({ ...p, use: use.includes(x.id) ? use.filter((y) => y !== x.id) : [...use, x.id] }))} />
              <span className="mute small">{x.kind === "textbook" ? "book" : "document"}</span> {x.title}
              {x.kind === "document" && <button className="linkish" onClick={(e) => { e.preventDefault(); setPlan((p) => ({ ...p, docs: (p.docs ?? []).filter((d) => d.id !== x.id), use: use.filter((y) => y !== x.id) })); }} title="Remove this document">×</button>}
            </label>
          ))}
          <UploadButton label="+ add a syllabus or document" onFiles={addDocs} busy={upl} />
        </div>
        <p className="mute small" style={{ margin: "4px 0 0" }}>Textbooks appear here once their PDF is saved in the Library. Tick what the plan should follow — or just tell Claude below.</p>
      </div>

      <div className="planchat">
        <div className="talk-msgs" style={{ margin: 0 }}>
          {!(plan.chat ?? []).length && (
            <div className="stack">
              <p className="mute" style={{ margin: 0 }}>Tell Claude how to plan this course — it follows your instructions to the letter, reads your chosen books and documents, can look at how other colleges teach it, and cites what it used.</p>
              {STARTERS.map((s) => <button key={s} className="linkish" style={{ textAlign: "left" }} onClick={() => send(s)} disabled={job.running}>{s} →</button>)}
            </div>
          )}
          {(plan.chat ?? []).map((m: ChatMessage) => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.role === "assistant" ? <Rich text={m.text} /> : m.text}
              {m.ops && m.ops.length > 0 && <ul className="ops">{m.ops.map((o, i) => <li key={i}>{o}</li>)}</ul>}
              {m === last && plan.undo && <button className="linkish" onClick={() => setPlan((p) => ({ ...p, items: p.undo ?? p.items, undo: undefined }))}>undo these changes</button>}
              {m.sources && m.sources.length > 0 && (
                <details className="srcs"><summary className="mute">sources ({m.sources.length})</summary>
                  <ol>{m.sources.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></li>)}</ol>
                </details>
              )}
            </div>
          ))}
          {job.running && (
            <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
              <Working since={job.started} what="Planning" doing="Following your instructions: reading your sources and searching where you asked, then updating the list" usual="1–4 minutes" />
              <button className="btn" onClick={() => job.stop()} title="Stop waiting and throw this answer away">stop</button>
            </div>
          )}
          {job.error && <div className="err">{job.error}</div>}
          <div ref={end} />
        </div>
        <form className="talk-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <textarea className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={st?.claude === false}
            placeholder="e.g. Look through Art Appreciation outlines at City Colleges and two other colleges, follow my textbook's chapters, and put photography in weeks 9–11"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <div className="row" style={{ justifyContent: "space-between" }}>
            {(plan.chat ?? []).length > 0 ? <button type="button" className="linkish" onClick={() => confirm("Clear this conversation? (The list of classes stays.)") && setPlan((p) => ({ ...p, chat: [] }))}>clear conversation</button> : <span />}
            <button className="btn solid" disabled={!text.trim() || job.running || st?.claude === false}>send</button>
          </div>
        </form>
      </div>

      {plan.items.length > 0 && (
        <>
          <div className="planlist">
            {weeksList.map((w) => (
              <div key={w} className="planweek">
                <div className="mono mute">week {w}</div>
                {plan.items.filter((x) => x.week === w).map((x) => (
                  <div key={x.id} className={`planitem ${x.use ? "" : "off"}`}>
                    <input type="checkbox" checked={x.use} onChange={() => setItem(x.id, { use: !x.use })} aria-label="use this class" />
                    <div className="grow">
                      <input className="plantopic" value={x.topic} onChange={(e) => setItem(x.id, { topic: e.target.value })} aria-label="topic" />
                      <textarea className="planpremise" rows={1} value={x.premise} onChange={(e) => setItem(x.id, { premise: e.target.value })} aria-label="premise" />
                      {(x.basis || x.sources?.length || x.theme) && (
                        <div className="mute small">
                          {[x.theme, x.basis].filter(Boolean).join(" · ")}
                          {x.sources?.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ marginLeft: 8 }}>[{i + 1}]</a>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" disabled={!ticked.length} onClick={() => add(false)}>add {ticked.length} ticked class{ticked.length === 1 ? "" : "es"}</button>
            <button className="btn solid" disabled={!ticked.length || st?.claude === false} onClick={() => add(true)}>add & make them</button>
            {unmade.length > 0 && <button className="linkish" disabled={!ticked.length || q.running} onClick={() => add(false, true)} title={q.running ? "Stop making classes first" : ""}>replace my {unmade.length} unmade class{unmade.length === 1 ? "" : "es"} with these</button>}
          </div>
          <span className="mute small">“make” builds each class in turn (about 4–6 minutes each) while a pine studio page stays open; pause or stop at any time.</span>
        </>
      )}
      <QueueControls courseId={course.id} />
    </div>
  );
}
