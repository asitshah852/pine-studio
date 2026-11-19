"use client";
import { useState } from "react";
import { api, readAsBase64, shrinkImage, useStatus } from "@/lib/client";
import type { Claim } from "@/lib/types";
import Claims from "./Claims";
import Working from "./Working";

type Up = { kind: "image" | "pdf"; data: string; name: string; preview?: string };
const MAX = 3_800_000;

export default function Checker() {
  const st = useStatus();
  const [text, setText] = useState("");
  const [ups, setUps] = useState<Up[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [claims, setClaims] = useState<Claim[] | null>(null);

  async function add(list: FileList | File[]) {
    setErr("");
    for (const f of Array.from(list)) {
      if (f.type.startsWith("image/")) {
        const url = await shrinkImage(f, 1600);
        setUps((u) => [...u, { kind: "image", data: url.split(",")[1], name: f.name, preview: url }]);
      } else if (f.type === "application/pdf") {
        const data = await readAsBase64(f);
        setUps((u) => [...u, { kind: "pdf", data, name: f.name }]);
      } else setErr(`${f.name}: use images, PDFs, or paste the text. (Save PowerPoint as PDF to check a whole deck.)`);
    }
  }

  async function run() {
    setErr("");
    setClaims(null);
    if (ups.reduce((n, u) => n + u.data.length, 0) + text.length > MAX) return setErr("Too much in one go: check fewer pages at a time.");
    setBusy(true);
    try {
      const r = await api<{ claims: Claim[] }>("/api/check", {
        method: "POST",
        body: JSON.stringify({ items: text.trim() ? [{ id: "text", text }] : [], uploads: ups.map(({ kind, data }) => ({ kind, data })) }),
      });
      setClaims(r.claims);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const bad = claims?.filter((c) => c.verdict === "contradicted").length ?? 0;
  const unv = claims?.filter((c) => c.verdict === "unverified").length ?? 0;

  return (
    <main className="page" onPaste={(e) => { const imgs = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/")); if (imgs.length) { e.preventDefault(); add(imgs); } }}>
      <div className="head">
        <div>
          <h1>Checker</h1>
          <p>Fact-check anything before it reaches students: a handout, a slide, a PDF of a deck, a wall label, an email. Every verdict links to the page that backs it; if nothing backs it, it says so.</p>
        </div>
      </div>
      <div className="bench" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <section className="stack">
          <textarea className="area" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text to check…" />
          <label className="drop drop-file" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
            <input type="file" accept="image/*,application/pdf" multiple className="hide" onChange={(e) => e.target.files && add(e.target.files)} />
            Drop screenshots or PDFs (or ⌘V to paste a screenshot)
          </label>
          {ups.length > 0 && (
            <div className="thumbs">
              {ups.map((u, i) => (
                <div key={i} className="t" title={u.name}>
                  <div className="photo">{u.preview ? <img src={u.preview} alt="" /> : <div className="ph mono" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>PDF</div>}</div>
                  <button className="btn sm solid" onClick={() => setUps((x) => x.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
          <div className="row">
            <button className="btn solid" disabled={busy || (!text.trim() && !ups.length) || st?.claude === false} onClick={run}>{busy ? "checking…" : "check"}</button>
            {st?.claude === false && <span className="mute" style={{ fontSize: 16 }}>Needs the Claude key (see SETUP.md).</span>}
          </div>
          {busy && <Working what="Fact-checking" doing="Searching the web to check every name, date and claim" usual="1–3 minutes" />}
          {err && <div className="err">{err}</div>}
          <div className="note">
            <b>What it can’t do:</b> judge opinions or interpretation; confirm facts no public page covers (it marks those “?”); read PowerPoint files directly (save as PDF). It’s a second pair of eyes, not a replacement for yours.
          </div>
        </section>
        <section>
          {claims ? (
            <>
              <div className="row mono" style={{ gap: 18, marginBottom: 10 }}>
                <span className={`v ${bad ? "bad" : "ok"}`}>{bad} wrong</span>
                <span className={`v ${unv ? "unv" : "ok"}`}>{unv} unverified</span>
                <span className="v ok">{claims.length - bad - unv} supported</span>
              </div>
              <Claims claims={claims} />
            </>
          ) : <div className="empty">Results appear here.</div>}
        </section>
      </div>
    </main>
  );
}
