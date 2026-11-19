"use client";
// Tool panels used in Prep (Slides step): exhibit search, textbook pages, her own images, library.
import { useEffect, useState } from "react";
import { api, proxied, readAsBase64, shrinkImage, useStatus } from "@/lib/client";
import { startDrag } from "@/lib/drag";
import Working from "./Working";
import type { Artwork, Lesson, Resource, TextbookPoint } from "@/lib/types";

const MAX_UPLOAD = 3_800_000; // the host accepts ~4.5 MB per request

export function TextbookPanel({ books }: { books: Resource[] }) {
  const st = useStatus();
  const [book, setBook] = useState(books[0]?.title ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [points, setPoints] = useState<TextbookPoint[]>([]);
  const res = books.find((b) => b.title === book);

  async function run() {
    setErr("");
    setBusy(true);
    try {
      const pdf = file ? await readAsBase64(file) : undefined;
      if ((pdf?.length ?? 0) + text.length > MAX_UPLOAD) throw new Error("That's too big for one go: upload about 15 pages at a time.");
      const r = await api<{ points: TextbookPoint[] }>("/api/textbook", { method: "POST", body: JSON.stringify({ pdf, text: pdf ? undefined : text, book, ask }) });
      setPoints(r.points);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 16 }}>Upload pages from your textbook (PDF or scan) or paste a passage. Points come only from those pages, with the page number and the exact words.</p>
      <div>
        <label className="label mono">Book</label>
        <input className="input" list="books" value={book} onChange={(e) => setBook(e.target.value)} />
        <datalist id="books">{books.map((b) => <option key={b.id} value={b.title} />)}</datalist>
      </div>
      <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") setFile(f); }}>
        <input type="file" accept="application/pdf" className="hide" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        {file ? `${file.name} · ${(file.size / 1e6).toFixed(1)} MB` : "Drop a PDF of the pages, or click to choose"}
      </label>
      {!file && <textarea className="area" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the passage here" />}
      <input className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="What to pull out (optional): e.g. key terms and 3 works to show" />
      <button className="btn solid" disabled={busy || (!file && !text.trim()) || st?.claude === false} onClick={run}>{busy ? "reading…" : "pull out points"}</button>
      {busy && <Working what="Reading the pages" doing="Pulling out key points with page numbers and exact quotes" usual="under a minute" />}
      {err && <div className="err">{err}</div>}
      {points.map((p, i) => {
        const src = { title: `${book || "Textbook"}${p.page ? `, p. ${p.page}` : ""}`, url: res?.url || `book:${book}${p.page ? `#p${p.page}` : ""}` };
        return (
          <div key={i} className="point grab" draggable onDragStart={(e) => startDrag(e, { kind: "text", text: p.text, sources: [src], verified: true })}>
            {p.text}
            {p.quote && <div className="src" style={{ marginTop: 4 }}>“{p.quote}”</div>}
            <div className="mono mute" style={{ marginTop: 4 }}>{src.title}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ExhibitsPanel({ q, setQ, onAdd, addLabel = "+ Add" }: { q: string; setQ: (s: string) => void; onAdd: (a: Artwork) => void; addLabel?: string }) {
  const [results, setResults] = useState<Artwork[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdOnly, setPdOnly] = useState(false);
  const [src, setSrc] = useState<"all" | "museums" | "loc" | "youtube">("all");
  const st = useStatus();

  async function search(term = q) {
    if (!term.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/museum?q=${encodeURIComponent(term)}&src=${src}`).then((x) => x.json());
      setResults(r.results ?? []);
      setErrors(r.errors ?? []);
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (q) search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, src]);

  const shown = pdOnly ? results.filter((r) => r.publicDomain) : results;
  return (
    <div className="stack">
      <form className="row" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("q") as string; setQ(v); search(v); }}>
        <input name="q" className="input grow" defaultValue={q} key={q} placeholder="Artist, title, movement… e.g. Seurat" />
        <button className="btn solid" disabled={busy}>{busy ? "…" : "Search"}</button>
      </form>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="row" style={{ gap: 4 }}>
          {([["all", "museums + library of congress"], ["museums", "museums"], ["loc", "library of congress"], ["youtube", "youtube"]] as const).map(([k, label]) => (
            <button type="button" key={k} className={`chip ${src === k ? "on" : ""}`} onClick={() => setSrc(k)} disabled={k === "youtube" && st?.youtube === false} title={k === "youtube" && st?.youtube === false ? "Add YOUTUBE_API_KEY in Vercel to switch this on" : ""}>{label}</button>
          ))}
        </span>
        <label className="mono mute"><input type="checkbox" checked={pdOnly} onChange={(e) => setPdOnly(e.target.checked)} /> public domain only</label>
      </div>
      {errors.length > 0 && <div className="note">Couldn’t reach: {errors.join("; ")}</div>}
      <div className="exhibits">
        {shown.map((a) => (
          <div key={`${a.museum}-${a.id}`} className="ex grab" draggable onDragStart={(e) => startDrag(e, { kind: "artwork", artwork: a })}>
            <div className="photo">
              {a.thumbUrl ? <img src={proxied(a.thumbUrl)} alt="" loading="lazy" /> : <div className="ph" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>no image</div>}
              <span className="rights mono" style={{ fontSize: 12 }}>{a.video ? "▶ video" : a.publicDomain ? "PD" : "©?"}</span>
            </div>
            <b>{a.title}</b>
            <span className="mute">{a.artist.split("\n")[0]}{a.date && `, ${a.date}`}</span>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <a className="mute" href={a.url} target="_blank" rel="noreferrer">{a.museum} ↗</a>
              <button className="btn sm ghost" onClick={() => onAdd(a)}>{addLabel}</button>
            </div>
          </div>
        ))}
      </div>
      {!busy && q && !shown.length && !errors.length && <div className="empty">No works found.</div>}
      <p className="mute" style={{ fontSize: 15, margin: 0 }}>PD = public domain or no known restrictions: the full image goes into the deck. ©? = still in copyright: a small preview is used and flagged “rights: check” (classroom fair use is usually fine; posting online may not be). ▶ = YouTube video: linked and played from YouTube, never downloaded — use official channels.</p>
    </div>
  );
}

export function FilesPanel() {
  const [files, setFiles] = useState<{ url: string; name: string }[]>([]);
  const [credit, setCredit] = useState("Photo: Tanya");
  async function add(list: FileList | null) {
    for (const f of Array.from(list ?? []).filter((f) => f.type.startsWith("image/"))) {
      const url = await shrinkImage(f);
      setFiles((cur) => [...cur, { url, name: f.name }]);
    }
  }
  return (
    <div className="stack">
      <p className="mute" style={{ margin: 0, fontSize: 16 }}>Your own photographs, scans or diagrams. Drop them here, then drag onto a slide.</p>
      <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
        <input type="file" accept="image/*" multiple className="hide" onChange={(e) => add(e.target.files)} />
        Drop images, or click to choose
      </label>
      <div><label className="label mono">Credit line</label><input className="input" value={credit} onChange={(e) => setCredit(e.target.value)} /></div>
      <div className="exhibits">
        {files.map((f, i) => (
          <div key={i} className="ex grab" draggable onDragStart={(e) => startDrag(e, { kind: "image", url: f.url, credit: credit || f.name, rights: "own" })}>
            <div className="photo"><img src={f.url} alt="" /></div>
            <span className="mute">{f.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryPanel({ lesson, resources, toggle }: { lesson: Lesson; resources: Resource[]; toggle: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = resources.filter((r) => !q || `${r.title} ${r.author} ${r.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter the library…" />
      <p className="mute" style={{ margin: 0, fontSize: 16 }}>Tick to assign as a reading for this class. Drag to put it on a slide.</p>
      {shown.map((r) => (
        <div key={r.id} className="point grab row" style={{ flexWrap: "nowrap", alignItems: "start" }} draggable
          onDragStart={(e) => startDrag(e, { kind: "text", heading: "Reading", text: `${r.title}${r.author ? ` — ${r.author}` : ""}`, sources: r.url ? [{ title: r.title, url: r.url }] : [], verified: true })}>
          <input type="checkbox" checked={lesson.readings.includes(r.id)} onChange={() => toggle(r.id)} aria-label="Assign as reading" />
          <div>
            <div>{r.title}</div>
            <div className="src">{[r.author, r.kind].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

