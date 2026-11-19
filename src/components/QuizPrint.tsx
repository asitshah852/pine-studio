"use client";
// Printable quiz: student page, then the answer key on a new page. Print → "Save as PDF".
import { useEffect, useRef } from "react";
import { pad, useStudio } from "@/lib/studio";

const L = "ABCDEFG";

export default function QuizPrint({ id }: { id: string }) {
  const { ready, lessons, courseName } = useStudio();
  const l = lessons.find((x) => x.id === id);
  const printed = useRef(false);
  useEffect(() => {
    if (!l?.quiz || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 1200);
    return () => clearTimeout(t);
  }, [l]);
  if (!ready) return <main className="handout"><p>Loading…</p></main>;
  if (!l?.quiz) return <main className="handout"><p>No quiz for this class yet.</p></main>;
  const q = l.quiz;
  const head = <div className="mono mute">{courseName(l.courseId)} · class {pad(l.number)}</div>;
  return (
    <main className="handout quizprint">
      <div className="noprint row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <span className="mute">Quiz — use “Save as PDF” in the print window. The answer key prints on its own page.</span>
        <button className="btn solid" onClick={() => window.print()}>print / save as PDF</button>
      </div>
      {head}
      <h1>{l.topic} — quiz</h1>
      <p>Name: ______________________________ &nbsp; Date: ______________</p>
      <ol className="qlist">
        {q.questions.map((x) => (
          <li key={x.id}>
            <b>{x.q}</b>
            {x.kind === "choice" ? (
              <ol className="qopts" type="A">{x.options!.map((o, k) => <li key={k}>{o}</li>)}</ol>
            ) : (
              <div className="qlines"><span /><span /></div>
            )}
          </li>
        ))}
      </ol>
      {q.exit.length > 0 && (
        <>
          <h2>Exit ticket</h2>
          {q.exit.map((e, i) => <div key={i} className="qexit"><p>{e}</p><div className="qlines"><span /><span /></div></div>)}
        </>
      )}
      <section className="pagebreak">
        {head}
        <h2>Answer key (for you)</h2>
        <ol className="qlist">
          {q.questions.map((x) => {
            const k = x.kind === "choice" ? x.options!.indexOf(x.answer) : -1;
            return <li key={x.id}>{k >= 0 ? `${L[k]}) ` : ""}{x.answer}<div className="mute" style={{ fontStyle: "italic" }}>from {x.from}</div></li>;
          })}
        </ol>
      </section>
    </main>
  );
}
