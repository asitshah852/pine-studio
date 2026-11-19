"use client";
// Semester planner for one course: weeks + her themes → a suggested sequence of classes (topic and
// premise). She edits and ticks; "add" creates them as classes in prep, "add & make" also builds each
// one (research → slides → fact-check) one after another while this page is open.
import { useEffect, useState } from "react";
import { apiJob, load, save, uid, useStatus } from "@/lib/client";
import { forget, recover, runJob, useJob } from "@/lib/jobs";
import { makeClass } from "@/lib/make";
import { useStudio } from "@/lib/studio";
import type { Course, Lesson, Plan, PlanItem } from "@/lib/types";
import Working from "./Working";

const QKEY = "pine.makequeue";

/** Build queued classes one after another. Survives a reload: the queue is kept in the browser. */
export async function makeQueue(ids: string[], getLesson: (id: string) => Lesson | undefined, setLesson: (id: string, fn: (l: Lesson) => Lesson) => void, course: string, onStep: (left: number) => void) {
  const queue = [...new Set([...load<string[]>(QKEY, []), ...ids])];
  save(QKEY, queue);
  while (queue.length) {
    const id = queue[0];
    onStep(queue.length);
    const l = getLesson(id);
    if (l && !l.slides.length) await runJob(`make:${id}`, (stage) => makeClass(l, course, (fn) => setLesson(id, fn), stage));
    queue.shift();
    save(QKEY, queue);
  }
  onStep(0);
}

export default function Planner({ course, close }: { course: Course; close: () => void }) {
  const st = useStatus();
  const { lessons, updateCourses, updateLessons } = useStudio();
  const existing = lessons.filter((l) => l.courseId === course.id).sort((a, b) => a.number - b.number);
  const [weeks, setWeeks] = useState(course.plan?.weeks ?? 16);
  const [perWeek, setPerWeek] = useState(course.plan?.perWeek ?? 2);
  const [minutes, setMinutes] = useState<number | undefined>(existing.find((l) => l.minutes)?.minutes ?? 75);
  const [themes, setThemes] = useState(course.plan?.themes ?? "");
  const [left, setLeft] = useState(0);
  const key = `plan:${course.id}`;
  const job = useJob(key);
  const plan = course.plan;
  const setPlan = (fn: (p: Plan) => Plan) => updateCourses((cur) => cur.map((c) => (c.id === course.id && c.plan ? { ...c, plan: fn(c.plan) } : c)));
  const setItem = (id: string, patch: Partial<PlanItem>) => setPlan((p) => ({ ...p, items: p.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const keepPlan = (items: PlanItem[]) => updateCourses((cur) => cur.map((c) => (c.id === course.id ? { ...c, plan: { at: new Date().toISOString(), weeks, perWeek, themes, items } } : c)));

  useEffect(() => {
    recover(key, (data) => keepPlan((data as { items: PlanItem[] }).items));
  }, [course.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggest = () =>
    job.run(async () => {
      const r = await apiJob<{ items: PlanItem[] }>("/api/plan", { course: course.name, weeks, perWeek, minutes, themes, existing: existing.map((l) => ({ number: l.number, topic: l.topic })), jobKey: key });
      keepPlan(r.items);
      forget(key);
    });

  const ticked = plan?.items.filter((x) => x.use) ?? [];
  function add(make: boolean) {
    let n = Math.max(0, ...existing.map((l) => l.number));
    const made: Lesson[] = ticked.map((x) => ({ id: uid(), courseId: course.id, number: ++n, topic: x.topic.trim(), premise: x.premise.trim(), minutes, readings: [], slides: [], status: "draft" }));
    updateLessons((cur) => [...cur, ...made]);
    setPlan((p) => ({ ...p, items: p.items.filter((x) => !x.use) }));
    if (make) {
      const latest = () => load<Lesson[]>("pine.lessons", []);
      makeQueue(made.map((l) => l.id), (id) => latest().find((l) => l.id === id) ?? made.find((l) => l.id === id), (id, fn) => updateLessons((cur) => cur.map((l) => (l.id === id ? fn(l) : l))), course.name, setLeft);
    } else close();
  }

  const weeksList = plan ? [...new Set(plan.items.map((x) => x.week))].sort((a, b) => a - b) : [];
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
      </div>
      <div><label className="label">themes, must-cover topics, notes (optional)</label>
        <textarea className="input" rows={3} value={themes} onChange={(e) => setThemes(e.target.value)} placeholder="e.g. elements of art first; photography's place in art history; Chicago artists; a museum visit in week 9; midterm week 8" /></div>
      <p className="mute" style={{ margin: 0 }}>{weeks * perWeek} classes in all{existing.length ? `; you already have ${existing.length}, so it suggests ${Math.max(0, weeks * perWeek - existing.length)} more around them` : ""}. It suggests topics and angles only — each class’s facts are researched and sourced when it’s made.</p>
      {job.running ? (
        <Working since={job.started} what="Planning the semester" doing="Putting the classes in a teachable order around your themes" usual="about a minute" />
      ) : (
        <div><button className="btn solid" onClick={suggest} disabled={st?.claude === false}>{plan ? "suggest again" : "suggest classes"}</button></div>
      )}
      {job.error && <div className="err">{job.error}</div>}

      {plan && plan.items.length > 0 && !job.running && (
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
                      {x.theme && <span className="mono mute small">{x.theme}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" disabled={!ticked.length || left > 0} onClick={() => add(false)}>add {ticked.length} ticked class{ticked.length === 1 ? "" : "es"}</button>
            <button className="btn solid" disabled={!ticked.length || left > 0 || st?.claude === false} onClick={() => add(true)}>add & make them</button>
            <span className="mute">“make” builds each class in turn (about 4–6 minutes each) while this page stays open.</span>
          </div>
        </>
      )}
      {left > 0 && <Working what={`Making your classes — ${left} to go`} doing="Research, slides and fact-check for each new class, one after another; open any of them in Prep to watch" usual="4–6 minutes per class" />}
    </div>
  );
}

/** If a batch of classes was being made when the page closed, offer to carry on. */
export function MakeQueueNote() {
  const { lessons, updateLessons, courseName } = useStudio();
  const [left, setLeft] = useState(0);
  const [queued, setQueued] = useState<string[]>([]);
  useEffect(() => setQueued(load<string[]>(QKEY, [])), []);
  const waiting = queued.filter((id) => lessons.some((l) => l.id === id && !l.slides.length));
  if (left > 0) return <Working what={`Making your classes — ${left} to go`} doing="Research, slides and fact-check for each class, one after another" usual="4–6 minutes per class" />;
  if (!waiting.length) return null;
  const first = lessons.find((l) => l.id === waiting[0]);
  return (
    <div className="row" style={{ marginBottom: 18 }}>
      <span>{waiting.length} planned class{waiting.length === 1 ? " is" : "es are"} still to be made.</span>
      <button className="btn" onClick={() => {
        save(QKEY, []);
        makeQueue(waiting, (id) => load<Lesson[]>("pine.lessons", []).find((l) => l.id === id), (id, fn) => updateLessons((cur) => cur.map((l) => (l.id === id ? fn(l) : l))), courseName(first?.courseId ?? ""), setLeft);
      }}>carry on making them</button>
      <button className="linkish" onClick={() => { save(QKEY, []); setQueued([]); }}>not now</button>
    </div>
  );
}
