"use client";
import { useState } from "react";
import { api, uid, useCollection, useStatus } from "@/lib/client";
import type { FeedbackItem } from "@/lib/types";

const TABS = ["Library", "Classes", "Prep", "Checker", "Feedback", "Look & feel", "Something new"];

export default function Feedback() {
  const { items, update } = useCollection<FeedbackItem>("feedback", []);
  const st = useStatus();
  const [tab, setTab] = useState("Prep");
  const [text, setText] = useState("");
  const [sent, setSent] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const item: FeedbackItem = { id: uid(), tab, text: text.trim(), at: new Date().toISOString() };
    update((cur) => [item, ...cur]);
    setText("");
    try {
      const r = await api<{ emailed: boolean }>("/api/feedback", { method: "POST", body: JSON.stringify({ tab, text: item.text }) });
      setSent(r.emailed ? "Saved and emailed." : "Saved.");
    } catch {
      setSent("Saved.");
    }
  }

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const row = (f: FeedbackItem) => (
    <div key={f.id} className="item" style={{ gridTemplateColumns: "28px 120px 1fr auto" }}>
      <input type="checkbox" checked={!!f.done} onChange={() => update((cur) => cur.map((x) => (x.id === f.id ? { ...x, done: !x.done } : x)))} aria-label="Done" />
      <div className="mono mute">{f.tab}<div>{f.at.slice(0, 10)}</div></div>
      <div style={{ whiteSpace: "pre-wrap", textDecoration: f.done ? "line-through" : undefined, color: f.done ? "var(--mute)" : undefined }}>{f.text}</div>
      <button className="btn sm ghost" onClick={() => confirm("Delete this note?") && update((cur) => cur.filter((x) => x.id !== f.id))}>×</button>
    </div>
  );

  return (
    <main className="page">
      <div className="head">
        <div>
          <h1>Feedback</h1>
          <p>What’s missing, confusing or wrong? Pick the tab and write it the way you’d say it. Changes get made from this list and ticked off here.</p>
        </div>
      </div>
      <div className="lib">
        <section>
          <div className="mono mute" style={{ marginBottom: 8 }}>Open · {open.length}</div>
          <div className="list">{open.length ? open.map(row) : <div className="empty">No open notes.</div>}</div>
          {done.length > 0 && (
            <>
              <div className="mono mute" style={{ margin: "28px 0 8px" }}>Done · {done.length}</div>
              <div className="list">{done.map(row)}</div>
            </>
          )}
        </section>
        <form className="card stack" onSubmit={submit}>
          <h2>New note</h2>
          <div className="row">{TABS.map((t) => <button type="button" key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>{t}</button>)}</div>
          <textarea className="area" style={{ minHeight: 160 }} value={text} onChange={(e) => { setText(e.target.value); setSent(""); }} placeholder="e.g. In Prep I want to see the textbook page next to the points…" />
          <button className="btn solid">Send</button>
          {sent && <span className="mono mute">{sent}</span>}
          {st && !st.db && <p className="mute" style={{ fontSize: 12, margin: 0 }}>Notes are kept in this browser until shared saving is set up.</p>}
        </form>
      </div>
    </main>
  );
}
