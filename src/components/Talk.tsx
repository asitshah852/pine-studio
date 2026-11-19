"use client";
// "talk it through": a conversation with Claude about this class. It can discuss, look things up
// (with sources), find museum exhibits, and change the research document and slides — each change
// listed under the reply, with undo.
import { useEffect, useRef, useState } from "react";
import { apiJob, uid, useStatus } from "@/lib/client";
import { forget, useJob } from "@/lib/jobs";
import { undoChat, withChat } from "@/lib/lessonOps";
import type { ChatMessage, ChatOp, Lesson, Source } from "@/lib/types";
import Rich from "./Rich";
import Working from "./Working";

const STARTERS = [
  "What's missing from this class?",
  "Finish up",
  "Find two works in Chicago collections I could compare on one slide",
  "Make the talking points simpler for 19-year-olds",
  "Add a slide with a quick in-class activity",
];

export default function Talk({ lesson, course, set, close, onActions, shownSlide }: { lesson: Lesson; course: string; set: (fn: (l: Lesson) => Lesson) => void; close: () => void; onActions?: (ops: ChatOp[]) => void; shownSlide?: () => string | null }) {
  const st = useStatus();
  const key = `chat:${lesson.id}`;
  const job = useJob(key);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const msgs = lesson.chat ?? [];
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, job.running]);

  async function send(message: string) {
    const m = message.trim();
    if (!m || job.running) return;
    setText("");
    const user: ChatMessage = { id: uid(), role: "user", text: m, at: new Date().toISOString() };
    const history = msgs.slice(-12).map((x) => ({ role: x.role, text: x.text }));
    set((l) => ({ ...l, chat: [...(l.chat ?? []), user].slice(-40) })); // saved straight away
    const { chat: _c, versions: _v, materials: _m, review: _r, ...slim } = lesson;
    job.clearError();
    await job.run(async () => {
      const r = await apiJob<{ reply: string; sources: Source[]; ops: ChatOp[] }>("/api/chat", { lesson: slim, course, history, message: m, current: shownSlide?.() ?? null, jobKey: key });
      set((l) => withChat(l, user, r));
      forget(key);
      onActions?.(r.ops);
    });
  }

  return (
    <aside className="talk-panel" aria-label="Talk it through">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <h2 style={{ margin: 0 }}>talk it through</h2>
        <div className="row">
          {msgs.length > 0 && <button className="btn sm ghost" onClick={() => confirm("Clear this conversation? (Changes it made stay.)") && set((l) => ({ ...l, chat: [] }))}>clear</button>}
          <button className="btn sm ghost" onClick={close} aria-label="Close">close</button>
        </div>
      </div>
      <p className="mute" style={{ margin: "4px 0 0", fontSize: 17 }}>Discuss the class with Claude. Ask it to add or change research, edit slides, or find exhibits — it makes the change and you can undo it.</p>

      <div className="talk-msgs">
        {!msgs.length && (
          <div className="stack">
            {STARTERS.map((s) => <button key={s} className="chip" style={{ textAlign: "left" }} onClick={() => send(s)} disabled={st?.claude === false}>{s} →</button>)}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === "assistant" ? <Rich text={m.text} /> : <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>}
            {m.ops?.length ? (
              <ul className="ops">{m.ops.map((o, i) => <li key={i}>{m.undone ? <s>{o}</s> : o}</li>)}</ul>
            ) : null}
            {m.sources?.length ? (
              <div className="src">{m.sources.map((x, i) => <span key={i}>{i ? " · " : ""}<a href={x.url} target="_blank" rel="noreferrer">{x.title}</a></span>)}</div>
            ) : null}
            {m.undo && <button className="btn sm" onClick={() => set((l) => undoChat(l, m.id))}>undo these changes</button>}
            {m.undone && <div className="mute" style={{ fontSize: 16 }}>undone</div>}
          </div>
        ))}
        {job.running && <Working since={job.started} what="Thinking" doing="Reading the class, searching if needed, and making any changes" usual="20–90 seconds" />}
        {job.error && <div className="err">{job.error}</div>}
        <div ref={end} />
      </div>

      <form className="talk-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea
          className="area"
          rows={3}
          value={text}
          placeholder={st?.claude === false ? "Claude isn't switched on yet." : "e.g. Add a slide on how MTV changed album covers"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          disabled={st?.claude === false}
        />
        <button className="btn solid" disabled={!text.trim() || job.running || st?.claude === false}>send</button>
      </form>
    </aside>
  );
}
