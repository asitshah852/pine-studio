// Bringing in a whole folder of classes she has already taught (e.g. downloaded from Google Drive as a
// zip): each presentation becomes a class; handouts in the same folder are attached to it.
// Grouping is pure (tested in tests/core.test.ts); unpacking runs in the browser.

export type Entry = { name: string; folder: string };
export type Proposal = { title: string; folder: string; deck?: number; files: number[]; use: boolean };

const ext = (n: string) => n.toLowerCase().split(".").pop() ?? "";
export const isDeck = (n: string) => ext(n) === "pptx";
export const isDoc = (n: string) => ["pdf", "docx", "txt", "md"].includes(ext(n));
/** Files that can't be read, with what to do about them. */
export function problem(n: string): string | null {
  const e = ext(n);
  if (e === "ppt") return "old PowerPoint (.ppt) — open it and save as .pptx";
  if (e === "doc") return "old Word (.doc) — save it as .docx or PDF";
  if (e === "key") return "Keynote — export it as PowerPoint (.pptx)";
  if (["gslides", "gdoc", "gsheet", "gdraw"].includes(e)) return "a Google shortcut — in Google, File → Download → Microsoft PowerPoint (.pptx) or PDF";
  return null;
}

const STOP = new Set(["the", "and", "of", "a", "an", "in", "on", "to", "for", "with", "slides", "slide", "deck", "presentation", "handout", "notes", "reading", "copy", "final", "pptx", "pdf", "docx"]);
const words = (s: string) => new Set(s.toLowerCase().replace(/\.[a-z0-9]+$/, "").split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)));

/** "Week 03 - Impressionism_and the camera.pptx" → "Impressionism and the camera". */
export function cleanTitle(name: string): string {
  const stem = name.replace(/\.[A-Za-z0-9]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const t = stem
    .replace(/^(week|wk|class|lecture|lec|session|day|module|unit|lesson)\s*\d+[a-z]?\s*[-–—:.,)]*\s*/i, "")
    .replace(/^\d+[a-z]?\s*[-–—:.,)]+\s*/i, "")
    .replace(/^\d+\s+/, "")
    .trim();
  return t || stem;
}

/** Natural order: "Week 2" before "Week 10". */
export const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export function group(entries: Entry[]): Proposal[] {
  const idx = entries.map((e, i) => ({ ...e, i })).filter((e) => isDeck(e.name) || isDoc(e.name));
  const folders = [...new Set(idx.map((e) => e.folder))];
  const out: Proposal[] = [];
  for (const f of folders) {
    const decks = idx.filter((e) => e.folder === f && isDeck(e.name)).sort((a, b) => natural(a.name, b.name));
    const docs = idx.filter((e) => e.folder === f && isDoc(e.name)).sort((a, b) => natural(a.name, b.name));
    const props = decks.map((d) => ({ title: cleanTitle(d.name), folder: f, deck: d.i, files: [d.i], use: true }) as Proposal);
    const leftover: typeof docs = [];
    for (const doc of docs) {
      if (props.length === 1) { props[0].files.push(doc.i); continue; }
      // several decks in one folder: attach a handout to the deck whose name it shares most words with
      const w = words(doc.name);
      let best = -1, score = 0;
      props.forEach((p, k) => {
        const n = [...words(entries[p.deck!].name)].filter((x) => w.has(x)).length;
        if (n > score) { score = n; best = k; }
      });
      if (best >= 0) props[best].files.push(doc.i);
      else leftover.push(doc);
    }
    if (!props.length && leftover.length === 0 && docs.length) {
      // a folder with handouts but no slides: one class named after the folder (not ticked by default)
      if (f) out.push({ title: cleanTitle(f.split("/").pop()!), folder: f, files: docs.map((d) => d.i), use: false });
      else docs.forEach((d) => out.push({ title: cleanTitle(d.name), folder: f, files: [d.i], use: false }));
    }
    leftover.forEach((d) => out.push({ title: cleanTitle(d.name), folder: f, files: [d.i], use: false }));
    out.push(...props);
  }
  return out.sort((a, b) => natural(`${a.folder}/${a.deck !== undefined ? entries[a.deck].name : entries[a.files[0]].name}`, `${b.folder}/${b.deck !== undefined ? entries[b.deck].name : entries[b.files[0]].name}`));
}

/** Zips (from Google Drive) and folders → files with their folder path. Browser only. */
export async function unpack(files: File[], onProgress?: (s: string) => void): Promise<{ file: File; folder: string }[]> {
  const out: { file: File; folder: string }[] = [];
  const skip = (p: string) => /(^|\/)(__MACOSX|\.)|(^|\/)~\$/.test(p);
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    if (/\.zip$/i.test(f.name)) {
      onProgress?.(`Opening ${f.name}…`);
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(f);
      for (const e of Object.values(zip.files)) {
        if (e.dir || skip(e.name)) continue;
        const parts = e.name.split("/");
        const name = parts.pop()!;
        const blob = await e.async("blob");
        out.push({ file: new File([blob], name), folder: parts.join("/") });
      }
    } else {
      if (skip(rel || f.name)) continue;
      out.push({ file: f, folder: rel.split("/").slice(0, -1).join("/") });
    }
  }
  // Drive puts everything under one top folder: drop a folder level every file shares.
  const tops = new Set(out.map((x) => x.folder.split("/")[0]));
  if (tops.size === 1 && out.every((x) => x.folder)) {
    const top = [...tops][0];
    for (const x of out) x.folder = x.folder === top ? "" : x.folder.slice(top.length + 1);
  }
  return out;
}
