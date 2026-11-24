"use client";
// Library: one quiet list in four sections, a search box, and "+ add a resource" that opens in place.
// Edit / remove / find a free copy appear on hover.
import { useEffect, useMemo, useState } from "react";
import { api, uid, useCollection, useStatus } from "@/lib/client";
import { pdfUrl } from "@/lib/textbooks";
import { clearPdfError, enqueuePdf, resumePdfs, usePdfQueue } from "@/lib/pdfQueue";
import { STARTER_ADDITIONS, STARTER_RESOURCES, findLinks } from "@/lib/starter";
import { load as loadLocal, save as saveLocal } from "@/lib/client";
import type { Resource, ResourceKind } from "@/lib/types";

const isFreeBook = (r: Resource) => r.kind === "textbook" && /free|open|CC BY/i.test(`${r.publisher ?? ""} ${r.notes}`);

// Two sections only (Asit, Nov 2026): her stored books, then everything else.
const SECTIONS: { key: string; title: string; note: string; test: (r: Resource) => boolean }[] = [
  { key: "mine", title: "your books", note: "", test: (r) => !!r.pdf },
  { key: "rest", title: "free books and places to look", note: "", test: () => true },
];

const KIND_LABEL: Record<ResourceKind, string> = { textbook: "Textbook", journal: "Journal", paper: "Paper or essay", museum: "Museum", website: "Website", video: "Video", other: "Library access" };
const blank = { kind: "textbook" as ResourceKind, title: "", url: "", author: "", year: "", publisher: "", notes: "" };

export default function Library() {
  const { items, update, ready: libReady } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [q, setQ] = useState("");
  const [form, setForm] = useState(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [moreFields, setMoreFields] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openFind, setOpenFind] = useState<string | null>(null);
  const st = useStatus();
  const [pdfFor, setPdfFor] = useState<string | null>(null); // resource id with the "add a PDF" panel open
  const [pdfLink, setPdfLink] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pq = usePdfQueue();
  // Repair (Nov 2026): a saving bug could reduce the shared list to just the books she had touched.
  // If most of the starter list is missing, put the missing entries back once (matched by link, or title when there is no link).
  useEffect(() => {
    if (!libReady || loadLocal<boolean>("pine.starter.repair1", false)) return;
    update((cur) => {
      const key = (r: Resource) => r.url || r.title;
      const have = new Set(cur.map(key));
      const missing = STARTER_RESOURCES.filter((a) => !have.has(key(a)));
      return missing.length > STARTER_RESOURCES.length / 2 ? [...cur, ...missing.map((m) => ({ ...m, id: uid() }))] : cur;
    });
    saveLocal("pine.starter.repair1", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady]);
  // Add entries that joined the starter list after launch (once, matched by link).
  useEffect(() => {
    if (!libReady || loadLocal<boolean>("pine.starter.v2", false)) return;
    update((cur) => {
      const missing = STARTER_ADDITIONS.filter((a) => !cur.some((r) => r.url === a.url));
      return missing.length ? [...cur, ...missing.map((m) => ({ ...m, id: uid() }))] : cur;
    });
    saveLocal("pine.starter.v2", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libReady]);
  useEffect(() => {
    resumePdfs((id, pdf) => update((cur) => cur.map((r) => (r.id === id ? { ...r, pdf } : r))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Queue a PDF (file or link) for a resource; the panel closes straight away.
  function attachPdf(id: string, title: string, file: File | null, link: string) {
    clearPdfError(id);
    enqueuePdf({ id, title, file: file ?? undefined, link: file ? undefined : link.trim(), done: (pdf) => update((cur) => cur.map((r) => (r.id === id ? { ...r, pdf } : r))) });
    setPdfFor(null);
    setPdfLink("");
    setPdfFile(null);
  }
  const freeToSave = items.filter((r) => isFreeBook(r) && !r.pdf && r.url && !pq.status.has(r.id));
  const saveAllFree = () => freeToSave.forEach((r) => attachPdf(r.id, r.title, null, r.url!));
  const removePdf = (r: Resource) => {
    if (!r.pdf || !confirm(`Remove the stored PDF of “${r.title}”?`)) return;
    api(`/api/blob/file?path=${encodeURIComponent(r.pdf.path)}`, { method: "DELETE" }).catch(() => {});
    update((cur) => cur.map((x) => (x.id === r.id ? { ...x, pdf: undefined } : x)));
  };
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("q");
    if (v) setQ(v);
  }, []);

  const shown = useMemo(() => {
    const t = q.toLowerCase().trim();
    return items.filter((r) => (!t || `${r.title} ${r.author ?? ""} ${r.publisher ?? ""} ${r.topics.join(" ")} ${r.notes}`.toLowerCase().includes(t)));
  }, [items, q]);
  const savedCount = items.filter((r) => r.pdf).length;

  // Each resource goes in the first section it fits.
  const grouped = useMemo(() => {
    const used = new Set<string>();
    return SECTIONS.map((s) => {
      const list = shown.filter((r) => !used.has(r.id) && s.test(r));
      list.forEach((r) => used.add(r.id));
      return { ...s, list };
    }).filter((g) => g.list.length);
  }, [shown]);

  function openForm(r?: Resource) {
    setEditing(r?.id ?? null);
    setForm(r ? { kind: r.kind, title: r.title, url: r.url ?? "", author: r.author ?? "", year: r.year ?? "", publisher: r.publisher ?? "", notes: r.notes } : blank);
    setMoreFields(!!r);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setForm(blank);
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const data = {
      kind: form.kind,
      title: form.title.trim(),
      url: form.url.trim() || undefined,
      author: form.author.trim() || undefined,
      year: form.year.trim() || undefined,
      publisher: form.publisher.trim() || undefined,
      notes: form.notes.trim(),
    };
    if (editing) update((cur) => cur.map((r) => (r.id === editing ? { ...r, ...data, starter: false } : r)));
    else {
      const id = uid();
      update((cur) => [{ id, addedAt: new Date().toISOString(), topics: [], ...data }, ...cur]);
      if (data.kind === "textbook" || data.kind === "journal" || data.kind === "paper") setPdfFor(id);
    }
    closeForm();
  }

  return (
    <main className="page lib-page">
      <div className="head" style={{ marginBottom: 14 }}>
        <h1>Library</h1>
      </div>

      <div className="lib-tools">
        <input className="input" placeholder="Search the library…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
        {!formOpen && <button className="btn" onClick={() => openForm()}>+ add a resource</button>}
      </div>
      <div className="savedsum mute">
        {pq.busy > 0 && <span className="pdfstatus saving" style={{ marginRight: 14 }}><span className="spinner tiny" aria-hidden="true" /> saving {pq.busy} PDF{pq.busy === 1 ? "" : "s"} — links carry on even if you close the page ·</span>}
        {freeToSave.length > 0 && st?.pdfs !== false && (
          <><button className="linkish" onClick={saveAllFree}>save all free textbooks ({freeToSave.length})</button> · </>
        )}
        {!savedCount && <>No books saved yet — hover over a free textbook and click <b>save a PDF copy</b>.</>}
      </div>

      {formOpen && (
        <form className="lib-form" onSubmit={submit}>
          <div className="row" style={{ alignItems: "end" }}>
            <div className="grow"><label className="label">title</label><input className="input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
            <div className="grow"><label className="label">link (optional)</label><input className="input" type="url" placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div style={{ width: 170 }}>
              <label className="label">type</label>
              <select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ResourceKind })}>
                {(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k].toLowerCase()}</option>)}
              </select>
            </div>
          </div>
          {moreFields ? (
            <>
              <div className="row" style={{ alignItems: "end" }}>
                <div className="grow"><label className="label">author</label><input className="input" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} /></div>
                <div className="grow"><label className="label">publisher or journal</label><input className="input" value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} /></div>
                <div style={{ width: 90 }}><label className="label">year</label><input className="input" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
              </div>
              <div><label className="label">note</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. chapters 3–5 for the photography unit" /></div>
            </>
          ) : (
            <button type="button" className="linkish" onClick={() => setMoreFields(true)}>+ author, publisher, year, note</button>
          )}
          <div className="row">
            <button className="btn solid">{editing ? "save" : "add"}</button>
            <button type="button" className="btn ghost" onClick={closeForm}>cancel</button>
          </div>
        </form>
      )}

      {grouped.map((g) => (
        <section key={g.key} className="lib-section">
          <h2>{g.title}</h2>
          {g.note && <p className="mute lib-note">{g.note}</p>}
          {g.list.map((r) => (
            <article key={r.id} className="lib-item" title={r.starter ? "From the starter list, checked 19 Nov 2026 — confirm the edition or access." : undefined}>
              <div className="lib-main">
                <h3>
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a> : r.title}
                  {r.pdf && <a className="savedtag" href={pdfUrl(r.pdf.path)} target="_blank" rel="noreferrer" title="Your stored copy — click to open">saved</a>}
                </h3>
                {(r.author || r.publisher || r.year) && <div className="src">{[r.author, r.publisher, r.year].filter(Boolean).join(" · ")}</div>}
                {r.notes && <p>{r.notes}</p>}
                {r.pdf && (
                  <div className="pdfline">
                    <a href={pdfUrl(r.pdf.path)} target="_blank" rel="noreferrer">open your PDF ↗</a>
                    {(r.kind === "textbook" && (r.pdf.pages ?? 999) < 40) && <span className="err-inline">only {r.pdf.pages} pages — this may be a sample, not the whole book; try “add a PDF” with the full book’s link · </span>}<span className="mute">{r.pdf.pages ? `${r.pdf.pages} pages · ` : ""}{r.pdf.size < 1e5 ? `${Math.max(1, Math.round(r.pdf.size / 1e3))} KB` : `${(r.pdf.size / 1e6).toFixed(1)} MB`}{r.pdf.textId ? "" : " · scanned, so pine kitchen can’t read it"}</span>
                  </div>
                )}
                {pq.status.get(r.id) && (
                  <div className={`pdfstatus ${pq.status.get(r.id)!.state}`}>
                    {pq.status.get(r.id)!.state === "error" ? (
                      <>
                        <span className="v bad" /> Couldn’t save: {pq.status.get(r.id)!.note}{" "}
                        <button className="linkish" onClick={() => { clearPdfError(r.id); setPdfFor(r.id); setPdfLink(r.url ?? ""); }}>try another link</button>
                      </>
                    ) : (
                      <>
                        {pq.status.get(r.id)!.state === "saving" && <span className="spinner tiny" aria-hidden="true" />}
                        {pq.status.get(r.id)!.state === "queued" ? "waiting to save…" : `saving — ${pq.status.get(r.id)!.note}`}
                      </>
                    )}
                  </div>
                )}
                {pdfFor === r.id && (
                  <div className="pdfpanel">
                    {st?.pdfs === false ? (
                      <p className="note" style={{ margin: 0 }}>PDF storage isn’t switched on yet. In Vercel: pine-studio → Storage → Blob (private) → connect it to pine-studio, then <b>Deployments → ⋯ → Redeploy</b>.</p>
                    ) : (
                      <>
                        <div className="row" style={{ alignItems: "end" }}>
                          <div className="grow"><label className="label">the book’s web page or its PDF link — pine kitchen finds the PDF</label><input className="input" placeholder="https://" value={pdfLink} onChange={(e) => { setPdfLink(e.target.value); setPdfFile(null); }} /></div>
                          {st?.pdfUploads !== false && (
                            <>
                              <span className="mute">or</span>
                              <label className="btn ghost" style={{ cursor: "pointer" }}>
                                <input type="file" accept="application/pdf" className="hide" onChange={(e) => { setPdfFile(e.target.files?.[0] ?? null); setPdfLink(""); }} />
                                {pdfFile ? pdfFile.name : "choose a PDF on your computer"}
                              </label>
                            </>
                          )}
                        </div>
                        <div className="row">
                          <button className="btn solid" disabled={!pdfFile && !pdfLink.trim()} onClick={() => attachPdf(r.id, r.title, pdfFile, pdfLink)}>save PDF</button>
                          <button className="btn ghost" onClick={() => setPdfFor(null)}>cancel</button>
                        </div>
                        <p className="mute" style={{ margin: 0, fontSize: 16 }}>Only open-licence books (e.g. Creative Commons) or your own copy for your teaching. Kept private: share the book’s original link with students, not this file.</p>

                      </>
                    )}
                  </div>
                )}
                {openFind === r.id && (
                  <div className="find">
                    <span className="mute">find in a library:</span>
                    {findLinks(r.title, r.author).map((l) => (
                      <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
                    ))}
                  </div>
                )}
              </div>
              <div className="lib-actions">
                {(r.kind === "textbook" || r.kind === "journal") && !isFreeBook(r) && !r.pdf && (
                  <button className="btn sm ghost" onClick={() => setOpenFind(openFind === r.id ? null : r.id)} title="Search the Chicago Public Library, Internet Archive lending, JSTOR and WorldCat">
                    {openFind === r.id ? "hide" : "find in a library"}
                  </button>
                )}
                {(r.kind === "textbook" || r.kind === "journal" || r.kind === "paper") && !r.pdf && !pq.status.has(r.id) && (
                  <button className="btn sm ghost" onClick={() => { setPdfFor(r.id); setPdfFile(null); setPdfLink(r.url ?? ""); }}>{isFreeBook(r) ? "save a PDF copy" : "add a PDF"}</button>
                )}
                {r.pdf && <button className="btn sm ghost" onClick={() => removePdf(r)}>remove PDF</button>}
                <button className="btn sm ghost" onClick={() => openForm(r)}>edit</button>
                <button className="btn sm ghost" onClick={() => {
                  if (!confirm(`Remove “${r.title}”${r.pdf ? " and its stored PDF" : ""}?`)) return;
                  if (r.pdf) api(`/api/blob/file?path=${encodeURIComponent(r.pdf.path)}`, { method: "DELETE" }).catch(() => {});
                  update((cur) => cur.filter((x) => x.id !== r.id));
                }}>remove</button>
              </div>
            </article>
          ))}
        </section>
      ))}
      {!grouped.length && <div className="empty">Nothing matches “{q}”.</div>}
    </main>
  );
}
