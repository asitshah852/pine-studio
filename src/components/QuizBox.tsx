"use client";
// Quiz / exit ticket for one class: written only from this class's research and slides, with an
// answer key that says where each answer comes from. Word download or print → PDF.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useStatus } from "@/lib/client";
import { downloadQuiz } from "@/lib/docx";
import { recover, useJob } from "@/lib/jobs";
import { runQuiz } from "@/lib/make";
import type { Lesson, Quiz } from "@/lib/types";
import Working from "./Working";

const L = "ABCDEFG";

export default function QuizBox({ lesson, course, set }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void }) {
  const st = useStatus();
  const job = useJob(`quiz:${lesson.id}`);
  const [count, setCount] = useState(5);
  const [open, setOpen] = useState(false);
  const q = lesson.quiz;
  const hasMaterial = !!lesson.research?.sections.length || lesson.slides.length > 0;
  useEffect(() => {
    recover(`quiz:${lesson.id}`, (data) => set((x) => ({ ...x, quiz: data as Quiz })));
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const make = () => job.run(async () => { await runQuiz(lesson, course, set, count); setOpen(true); });
  const drop = (id: string) => set((x) => (x.quiz ? { ...x, quiz: { ...x.quiz, questions: x.quiz.questions.filter((y) => y.id !== id) } } : x));

  return (
    <div className="quizbox">
      <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
        {job.running ? (
          <Working since={job.started} what="Writing the quiz" doing="Writing questions only from this class’s research and slides, with an answer key" usual="about a minute" />
        ) : (
          <>
            <button className="btn" onClick={make} disabled={!hasMaterial || st?.claude === false}>{q ? "make a new quiz" : "make a quiz"}</button>
            <select className="select" style={{ width: "auto" }} value={count} onChange={(e) => setCount(+e.target.value)} aria-label="Number of questions">
              {[3, 5, 8, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}
            </select>
          </>
        )}
        {q && !job.running && (
          <>
            <button className="linkish" onClick={() => downloadQuiz(lesson, course)}>quiz (Word)</button>
            <Link className="linkish" href={`/quiz/${lesson.id}`} target="_blank">print / PDF</Link>
            <button className="linkish" onClick={() => setOpen(!open)}>{open ? "hide" : `show (${q.questions.length})`}</button>
          </>
        )}
      </div>
      {!hasMaterial && <p className="mute">Make the research or slides first — the quiz only uses what this class teaches.</p>}
      {job.error && <div className="err">{job.error}</div>}
      {q && open && (
        <ol className="qlist">
          {q.questions.map((x) => {
            const k = x.kind === "choice" ? x.options!.indexOf(x.answer) : -1;
            return (
              <li key={x.id} className="qitem">
                <b style={{ fontWeight: 500 }}>{x.q}</b>
                {x.kind === "choice" && <ol className="qopts" type="A">{x.options!.map((o, i) => <li key={i} className={i === k ? "right" : ""}>{o}</li>)}</ol>}
                <div className="mute">answer: {k >= 0 ? `${L[k]}) ` : ""}{x.answer} · from {x.from}</div>
                <button className="linkish hoverOnly" onClick={() => drop(x.id)}>remove</button>
              </li>
            );
          })}
          {q.exit.length > 0 && <li className="qitem" style={{ listStyle: "none" }}><span className="mute">exit ticket:</span> {q.exit.join(" · ")}</li>}
        </ol>
      )}
    </div>
  );
}
