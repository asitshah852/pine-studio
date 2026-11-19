"use client";
// Build a .pptx in the browser (pptxgenjs). Black-and-white house style; museum caption under
// each artwork; speaker notes; a closing Sources & image credits slide.
import { proxied } from "./client";
import { caption } from "./museum";
import { deckSources } from "./slides";
import type { Lesson, SlideImage } from "./types";
// (title is "Class N: topic")

const W = 13.333;
const H = 7.5;
const INK = "111111";
const MUTE = "6B6B6B";
const FONT = "Helvetica Neue";

async function toData(img: SlideImage): Promise<{ data: string; w: number; h: number } | null> {
  try {
    let data = img.url;
    if (!data.startsWith("data:")) {
      const r = await fetch(proxied(img.url));
      if (!r.ok) return null;
      const blob = await r.blob();
      data = await new Promise<string>((ok) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.readAsDataURL(blob);
      });
    }
    const size = await new Promise<{ w: number; h: number }>((ok) => {
      const im = new Image();
      im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => ok({ w: 4, h: 3 });
      im.src = data;
    });
    return { data, ...size };
  } catch {
    return null;
  }
}

const fit = (iw: number, ih: number, x: number, y: number, w: number, h: number) => {
  const s = Math.min(w / iw, h / ih);
  const fw = iw * s;
  const fh = ih * s;
  return { x: x + (w - fw) / 2, y: y + (h - fh) / 2, w: fw, h: fh };
};

export async function downloadPptx(lesson: Lesson) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.title = `Class ${lesson.number}: ${lesson.topic}`;
  p.author = "Pine Studio";

  for (const s of lesson.slides) {
    const sl = p.addSlide();
    sl.background = { color: s.layout === "title" ? INK : "FFFFFF" };
    const bullets = s.body.split("\n").map((t) => t.trim()).filter(Boolean);
    const imgs = (await Promise.all(s.images.map(toData))).map((d, i) => (d ? { ...d, meta: s.images[i] } : null)).filter(Boolean) as {
      data: string; w: number; h: number; meta: SlideImage;
    }[];

    if (s.layout === "title") {
      sl.addText(s.title || lesson.topic, { x: 0.8, y: 2.6, w: W - 1.6, h: 1.4, fontFace: FONT, fontSize: 44, color: "FFFFFF" });
      if (bullets.length) sl.addText(bullets.join("\n"), { x: 0.8, y: 4.1, w: W - 1.6, h: 1.2, fontFace: FONT, fontSize: 18, color: "BBBBBB" });
      sl.addText(`CLASS ${String(lesson.number).padStart(2, "0")}`, { x: 0.8, y: 0.6, w: 4, h: 0.4, fontFace: "Courier New", fontSize: 12, color: "BBBBBB", charSpacing: 4 });
    } else if (s.layout === "text" || !imgs.length) {
      sl.addText(s.title, { x: 0.8, y: 0.5, w: W - 1.6, h: 1, fontFace: FONT, fontSize: 32, color: INK, bold: true });
      if (bullets.length)
        sl.addText(bullets.map((t) => ({ text: t, options: { bullet: true } })), { x: 0.8, y: 1.7, w: W - 1.6, h: H - 2.4, fontFace: FONT, fontSize: 20, color: INK, valign: "top", paraSpaceAfter: 10 });
    } else if (s.layout === "compare" && imgs.length >= 2) {
      sl.addText(s.title, { x: 0.6, y: 0.3, w: W - 1.2, h: 0.7, fontFace: FONT, fontSize: 26, color: INK, bold: true });
      const colW = (W - 1.8) / 2;
      imgs.slice(0, 2).forEach((im, i) => {
        const x = 0.6 + i * (colW + 0.6);
        sl.addImage({ data: im.data, altText: im.meta.credit, ...fit(im.w, im.h, x, 1.15, colW, H - 2.5) });
        sl.addText(im.meta.credit, { x, y: H - 1.25, w: colW, h: 0.9, fontFace: FONT, fontSize: 10, color: MUTE, valign: "top" });
      });
    } else {
      const im = imgs[0];
      const vid = s.artworks[0]?.video;
      sl.addImage({ data: im.data, altText: im.meta.credit, ...fit(im.w, im.h, 0.5, 0.5, W * 0.58, H - 1), ...(vid ? { hyperlink: { url: `https://www.youtube.com/watch?v=${vid.id}`, tooltip: "Play on YouTube" } } : {}) });
      if (vid) sl.addText([{ text: "▶ Play on YouTube", options: { hyperlink: { url: `https://www.youtube.com/watch?v=${vid.id}` } } }], { x: 0.5, y: H - 0.5, w: 4, h: 0.4, fontFace: FONT, fontSize: 12, color: INK });
      const x = W * 0.58 + 0.9;
      const w = W - x - 0.6;
      sl.addText(s.title, { x, y: 0.6, w, h: 1.2, fontFace: FONT, fontSize: 26, color: INK, bold: true, valign: "top" });
      const cap = s.artworks[0] ? caption(s.artworks[0]) : im.meta.credit;
      sl.addText(cap, { x, y: 1.9, w, h: 1.3, fontFace: FONT, fontSize: 11, color: MUTE, valign: "top" });
    }
    // A video slide always carries its link, even if the thumbnail couldn't be fetched.
    const v = s.artworks.find((x) => x.video)?.video;
    if (v && !imgs.length) sl.addText([{ text: "▶ Play on YouTube", options: { hyperlink: { url: `https://www.youtube.com/watch?v=${v.id}` } } }], { x: 0.8, y: H - 1, w: 5, h: 0.5, fontFace: FONT, fontSize: 16, color: INK });
    // Talking points travel with every slide as presenter notes.
    const talk = [bullets.map((b) => `• ${b}`).join("\n"), s.notes].filter(Boolean).join("\n\n");
    if (talk) sl.addNotes(talk);
  }

  // Closing slide: every source and image credit, so the deck carries its own fact trail.
  const src = deckSources(lesson.slides);
  const credits = lesson.slides.flatMap((s) => s.images.map((i) => `${i.credit}${i.rights === "check" ? " (rights: check)" : ""}`));
  const end = p.addSlide();
  end.addText("Sources & image credits", { x: 0.6, y: 0.4, w: W - 1.2, h: 0.7, fontFace: FONT, fontSize: 24, color: INK, bold: true });
  const lines = [...src.map((s) => `${s.title} — ${s.url}`), ...credits];
  end.addText(lines.length ? lines.join("\n") : "No sources recorded.", { x: 0.6, y: 1.2, w: W - 1.2, h: H - 1.6, fontFace: FONT, fontSize: 9, color: MUTE, valign: "top" });

  const name = `Class ${String(lesson.number).padStart(2, "0")} - ${lesson.topic}`.replace(/[^\w\s-]/g, "").slice(0, 80);
  await p.writeFile({ fileName: `${name}.pptx` });
}
