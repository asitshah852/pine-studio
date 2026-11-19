"use client";
import { useEffect, useMemo, useState } from "react";
import { uid, useCollection } from "@/lib/client";
import { STARTER_RESOURCES, findLinks } from "@/lib/starter";
import type { Resource, ResourceKind } from "@/lib/types";

const KINDS: [ResourceKind | "all" | "free", string][] = [
  ["all", "All"],
  ["free", "Free / open"],
  ["textbook", "Textbooks"],
  ["journal", "Journals"],
  ["paper", "Papers & essays"],
  ["museum", "Museums"],
  ["website", "Websites"],
  ["video", "Video"],
  ["other", "Library access"],
];
const isFree = (r: Resource) => /free|open|public/i.test(`${r.publisher ?? ""} ${r.notes} ${r.title}`) || r.kind === "website" || r.kind === "museum";

const blank = { kind: "textbook" as ResourceKind, title: "", author: "", year: "", publisher: "", url: "", topics: "", notes: "" };

export default function Library() {
  const { items, update } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [openFind, setOpenFind] = useState<string | null>(null);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) setQ(v);
  }, []);

  const shown = useMemo(() => {
    const t = q.toLowerCase();
    return items.filter(
      (r) =>
        (kind === "all" || (kind === "free" ? isFree(r) : r.kind === kind)) &&
        (!t || `${r.title} ${r.author} ${r.topics.join(" ")} ${r.notes}`.toLowerCase().includes(t)),
    );
  }, [items, kind, q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const data = {
      kind: form.kind,
      title: form.title.trim(),
      author: form.author.trim() || undefined,
      year: form.year.trim() || undefined,
      publisher: form.publisher.trim() || undefined,
      url: form.url.trim() || undefined,
      topics: form.topics.split(",").map((s) => s.trim()).filter(Boolean),
      notes: form.notes.trim(),
    };
    if (editing) update((cur) => cur.map((r) => (r.id === editing ? { ...r, ...data, starter: false } : r)));
    else update((cur) => [{ id: uid(), addedAt: new Date().toISOString(), ...data }, ...cur]);
    setForm(blank);
    setEditing(null);
  }

  return (
    <main className="page">
      <div className="head">
        <div>
          <h1>Library</h1>
          <p>
            Textbooks, journals, papers and collections for the course — free and open resources first, then what she can
            reach through City Colleges and the Chicago Public Library. Every link opens the real page.
          </p>
        </div>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="lib">
        <section>
          <div className="filters">
            {KINDS.map(([k, label]) => (
              <button key={k} className={`chip ${kind === k ? "on" : ""}`} onClick={() => setKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="list">
            {shown.map((r) => (
              <article className="item" key={r.id}>
                <div className="k mono">
                  {r.kind === "other" ? "access" : r.kind}
                  {r.year && <div>{r.year}</div>}
                </div>
                <div>
                  <h3>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title} ↗</a> : r.title}</h3>
                  <div className="src">{[r.author, r.publisher].filter(Boolean).join(" · ")}</div>
                  {r.notes && <p style={{ margin: "6px 0 0", fontSize: 17 }}>{r.notes}</p>}
                  <div className="row" style={{ marginTop: 8 }}>
                    {r.topics.map((t) => (
                      <button key={t} className="chip" onClick={() => setQ(t)}>{t}</button>
                    ))}
                    {r.starter && <span className="chip" title="From the starter list, checked 19 Nov 2026. Confirm edition/access.">starter · checked nov 2026</span>}
                  </div>
                  {openFind === r.id && (
                    <div className="find">
                      <span className="mono mute">Find a free copy:</span>
                      {findLinks(r.title, r.author).map((l) => (
                        <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="stack" style={{ textAlign: "right" }}>
                  <button className="btn ghost sm" onClick={() => setOpenFind(openFind === r.id ? null : r.id)}>Find free</button>
                  <button
                    className="btn ghost sm"
                    onClick={() => {
                      setEditing(r.id);
                      setForm({ kind: r.kind, title: r.title, author: r.author ?? "", year: r.year ?? "", publisher: r.publisher ?? "", url: r.url ?? "", topics: r.topics.join(", "), notes: r.notes });
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn ghost sm" onClick={() => confirm(`Remove “${r.title}”?`) && update((cur) => cur.filter((x) => x.id !== r.id))}>Remove</button>
                </div>
              </article>
            ))}
            {!shown.length && <div className="empty">Nothing matches.</div>}
          </div>
        </section>

        <aside className="card" style={{ position: "sticky", top: 24 }}>
          <h2>{editing ? "Edit resource" : "Add a resource"}</h2>
          <form className="stack" onSubmit={submit}>
            <div>
              <label className="label mono">Type</label>
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ResourceKind })}>
                {KINDS.slice(2).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div><label className="label mono">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="row">
              <div className="grow"><label className="label mono">Author</label><input className="input" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
              <div style={{ width: 90 }}><label className="label mono">Year</label><input className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
            </div>
            <div><label className="label mono">Publisher / journal</label><input className="input" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></div>
            <div><label className="label mono">Link</label><input className="input" type="url" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div><label className="label mono">Topics (comma separated)</label><input className="input" value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} /></div>
            <div><label className="label mono">Notes</label><textarea className="area" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <div className="row">
              <button className="btn solid">{editing ? "Save" : "Add to library"}</button>
              {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</button>}
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
