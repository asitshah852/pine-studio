"use client";
// Bring in class materials she already has.
//  • PowerPoint (.pptx): every slide becomes an editable slide — title, text, speaker notes, pictures.
//  • PDF, Word (.docx), text: kept as class materials with their full text (used by "suggest improvements").
//  • Pictures: one slide each.
// Nothing is rewritten on the way in: what she uploaded is what she gets.
import JSZip from "jszip";
import { shrinkImage, uid } from "./client";
import { saveImage, saveText } from "./files";
import type { Material, Slide } from "./types";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const paras = (el: Element) =>
  Array.from(el.getElementsByTagNameNS(A, "p"))
    .map((p) => Array.from(p.getElementsByTagNameNS(A, "t")).map((t) => t.textContent ?? "").join("").trim())
    .filter(Boolean);

function resolve(base: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

async function rels(zip: JSZip, part: string): Promise<Map<string, { type: string; target: string }>> {
  const relPath = part.replace(/([^/]+)$/, "_rels/$1.rels");
  const f = zip.file(relPath);
  const out = new Map<string, { type: string; target: string }>();
  if (!f) return out;
  for (const r of Array.from(xml(await f.async("string")).getElementsByTagName("Relationship"))) {
    out.set(r.getAttribute("Id") ?? "", { type: r.getAttribute("Type") ?? "", target: resolve(part, r.getAttribute("Target") ?? "") });
  }
  return out;
}

const blobToFile = (b: Blob, name: string) => new File([b], name, { type: b.type || "image/png" });

export async function importPptx(file: File, onProgress?: (s: string) => void): Promise<{ slides: Slide[]; text: string }> {
  const zip = await JSZip.loadAsync(file);
  const pres = xml(await zip.file("ppt/presentation.xml")!.async("string"));
  const presRels = await rels(zip, "ppt/presentation.xml");
  const order = Array.from(pres.getElementsByTagNameNS(P, "sldId"))
    .map((s) => presRels.get(s.getAttributeNS(R, "id") ?? s.getAttribute("r:id") ?? "")?.target)
    .filter((t): t is string => !!t);
  const slides: Slide[] = [];
  const all: string[] = [];
  for (const [i, part] of order.entries()) {
    onProgress?.(`Slide ${i + 1} of ${order.length}…`);
    const doc = xml(await zip.file(part)!.async("string"));
    const r = await rels(zip, part);
    let title = "";
    const body: string[] = [];
    let isTitleSlide = false;
    for (const sp of Array.from(doc.getElementsByTagNameNS(P, "sp"))) {
      const ph = sp.getElementsByTagNameNS(P, "ph")[0];
      const type = ph?.getAttribute("type") ?? "";
      const lines = paras(sp);
      if (!lines.length) continue;
      if ((type === "title" || type === "ctrTitle") && !title) {
        title = lines.join(" ");
        if (type === "ctrTitle") isTitleSlide = true;
      } else if (type !== "sldNum" && type !== "dt" && type !== "ftr") body.push(...lines);
    }
    // speaker notes
    let notes = "";
    for (const v of r.values()) {
      if (!v.type.endsWith("/notesSlide") || !zip.file(v.target)) continue;
      const nd = xml(await zip.file(v.target)!.async("string"));
      for (const sp of Array.from(nd.getElementsByTagNameNS(P, "sp"))) {
        if (sp.getElementsByTagNameNS(P, "ph")[0]?.getAttribute("type") === "body") notes = paras(sp).join("\n");
      }
    }
    // pictures, in the order they appear
    const images: Slide["images"] = [];
    for (const blip of Array.from(doc.getElementsByTagNameNS(A, "blip"))) {
      const t = r.get(blip.getAttributeNS(R, "embed") ?? blip.getAttribute("r:embed") ?? "");
      const f = t && zip.file(t.target);
      if (!f || !/\.(png|jpe?g|gif|bmp|webp)$/i.test(t.target)) continue;
      try {
        const small = await shrinkImage(blobToFile(await f.async("blob"), t.target), 1600);
        images.push({ url: await saveImage(small), credit: `From your deck “${file.name}”`, rights: "own" });
      } catch {
        /* skip a picture the browser can't read (e.g. EMF) */
      }
      if (images.length >= 4) break;
    }
    if (!title && !body.length && !images.length && !notes) continue;
    all.push([title, ...body, notes && `Notes: ${notes}`].filter(Boolean).join("\n"));
    slides.push({
      id: uid(),
      layout: isTitleSlide || (i === 0 && !body.length && !images.length) ? "title" : images.length >= 2 ? "compare" : images.length ? "artwork" : "text",
      title,
      body: body.join("\n"),
      notes,
      images,
      artworks: [],
      sources: [],
    });
  }
  return { slides, text: all.map((t, i) => `--- Slide ${i + 1} ---\n${t}`).join("\n\n") };
}

async function docxText(file: File) {
  const zip = await JSZip.loadAsync(file);
  const doc = xml(await zip.file("word/document.xml")!.async("string"));
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  return Array.from(doc.getElementsByTagNameNS(W, "p"))
    .map((p) => Array.from(p.getElementsByTagNameNS(W, "t")).map((t) => t.textContent ?? "").join(""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfText(file: File) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`).join("\n\n");
}

export const ACCEPT = ".pptx,.pdf,.docx,.txt,.md,image/*";

/** Import one file. Returns slides to add (pptx, images) and the material record. */
export async function importFile(file: File, onProgress?: (s: string) => void): Promise<{ slides: Slide[]; material: Material }> {
  const name = file.name;
  const at = new Date().toISOString();
  const lower = name.toLowerCase();
  let slides: Slide[] = [];
  let text = "";
  let kind: Material["kind"];
  if (lower.endsWith(".pptx")) {
    kind = "pptx";
    ({ slides, text } = await importPptx(file, onProgress));
  } else if (lower.endsWith(".ppt")) {
    throw new Error(`${name}: old .ppt files can't be read. In PowerPoint, use File → Save As → .pptx, then upload that.`);
  } else if (lower.endsWith(".pdf")) {
    kind = "pdf";
    onProgress?.("Reading the PDF…");
    text = await pdfText(file);
  } else if (lower.endsWith(".docx")) {
    kind = "docx";
    text = await docxText(file);
  } else if (lower.endsWith(".doc")) {
    throw new Error(`${name}: old .doc files can't be read. Save it as .docx or PDF, then upload that.`);
  } else if (file.type.startsWith("image/")) {
    kind = "image";
    const url = await saveImage(await shrinkImage(file, 1600));
    slides = [{ id: uid(), layout: "artwork", title: name.replace(/\.[^.]+$/, ""), body: "", notes: "", images: [{ url, credit: `Your image “${name}”`, rights: "own" }], artworks: [], sources: [] }];
  } else {
    kind = "text";
    text = await file.text();
  }
  onProgress?.("Saving…");
  const fileId = text ? await saveText(text) : undefined;
  return {
    slides,
    material: { id: uid(), name, kind, fileId, preview: (fileId ? text.slice(0, 600) : text.slice(0, 20000)).trim(), slides: slides.length || undefined, at },
  };
}
