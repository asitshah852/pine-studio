"use client";
// Presenter view (her laptop): this slide, its talking points, the next slide and a class clock.
// "open audience window" opens /show/<id> for the projector; the two stay in step (BroadcastChannel).
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pad, useStudio } from "@/lib/studio";
import SlideView from "./SlideView";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.abs(s) % 60).padStart(2, "0")}`;

export default function Presenter({ id }: { id: string }) {
  const { ready, lessons, courseName } = useStudio();
  const l = lessons.find((x) => x.id === id);
  const [i, setI] = useState(0);
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const n = l?.slides.length ?? 0;

  const goTo = useCallback((k: number) => setI(Math.max(0, Math.min(n - 1, k))), [n]);

  useEffect(() => {
    const c = new BroadcastChannel(`pine-show-${id}`);
    chan.current = c;
    c.onmessage = (e) => {
      const d = e.data as { nav?: number; hello?: boolean };
      if (d.nav) setI((x) => Math.max(0, Math.min(n - 1, x + d.nav!)));
      if (d.hello) c.postMessage({ i: iRef.current });
    };
    return () => c.close();
  }, [id, n]);
  const iRef = useRef(0);
  useEffect(() => {
    iRef.current = i;
    chan.current?.postMessage({ i });
  }, [i]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(n - 1, x + 1)); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);

  if (!ready) return <main className="presenter"><p>Loading…</p></main>;
  if (!l || !n) return <main className="presenter"><p>This class has no slides yet. <Link href="/classes">Back to classes</Link></p></main>;

  const s = l.slides[i];
  const next = l.slides[i + 1];
  const points = s.notes.split("\n").map((t) => t.replace(/^\s*[-•*]\s+/, "").trim()).filter(Boolean);
  const target = (l.minutes ?? 0) * 60;
  const left = target ? target - secs : 0;

  return (
    <main className="presenter">
      <header className="ptop">
        <span>{courseName(l.courseId)} · class {pad(l.number)} · {l.topic}</span>
        <span className="row" style={{ gap: 18 }}>
          <button className="pbtn" onClick={() => window.open(`/show/${id}`, `pine-show-${id}`, "popup,width=1280,height=720")}>open audience window ↗</button>
          <Link className="pbtn" href={`/classes?open=${id}`}>end</Link>
        </span>
      </header>
      <div className="pgrid">
        <section className="pnow">
          <SlideView s={s} n={l.number} />
          <div className="pnavrow">
            <button className="pbtn big" onClick={() => goTo(i - 1)} disabled={i === 0}>‹</button>
            <span>slide {i + 1} of {n}</span>
            <button className="pbtn big" onClick={() => goTo(i + 1)} disabled={i >= n - 1}>›</button>
          </div>
        </section>
        <aside className="pside">
          <div className="pclock">
            <span className="time">{clock(secs)}</span>
            {target > 0 && <span className={`left ${left < 0 ? "over" : ""}`}>{left >= 0 ? `${clock(left)} left of ${l.minutes} min` : `${clock(-left)} over`}</span>}
            <span className="row" style={{ gap: 14 }}>
              <button className="pbtn" onClick={() => setRunning(!running)}>{running ? "pause" : secs ? "resume" : "start clock"}</button>
              {secs > 0 && <button className="pbtn" onClick={() => { setSecs(0); setRunning(false); }}>reset</button>}
            </span>
          </div>
          <div className="ppoints">
            <div className="plabel">talking points</div>
            {points.length ? points.map((p, k) => <p key={k}>{p}</p>) : <p className="pmute">None for this slide — add them under the slide in Prep.</p>}
          </div>
          <div className="pnext">
            <div className="plabel">next</div>
            {next ? <button className="pnextbtn" onClick={() => goTo(i + 1)}><SlideView s={next} n={l.number} /></button> : <p className="pmute">That’s the last slide.</p>}
          </div>
        </aside>
      </div>
      <nav className="pthumbs">
        {l.slides.map((x, k) => (
          <button key={x.id} className={k === i ? "on" : ""} onClick={() => goTo(k)} title={x.title}>{k + 1}</button>
        ))}
      </nav>
    </main>
  );
}
