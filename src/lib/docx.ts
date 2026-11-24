"use client";
// The research document as a Word file she can keep and edit.
import type { Lesson } from "./types";

// Laid out like a magazine article (Asit, Nov 2026: "like The Economist"): a red section flag, a
// serif headline, an opening that starts in small caps, short crossheads, indented paragraphs, and
// small superscript source numbers that lead to a numbered source list at the end.
const RED = "E3120B";
const GREY = "6B6B6B";
const SERIF = "Georgia";
const SANS = "Helvetica";

export async function downloadDocx(lesson: Lesson, course: string) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, BorderStyle } = d;
  const doc = lesson.research;
  if (!doc) return;
  const num = new Map<string, number>();
  const list: { title: string; url: string }[] = [];
  const ref = (url: string, title: string) => {
    if (!num.has(url)) {
      list.push({ title, url });
      num.set(url, list.length);
    }
    return num.get(url)!;
  };
  const sup = (t: string) => new TextRun({ text: t, superScript: true, color: GREY, size: 17 });
  const crosshead = (t: string) =>
    new Paragraph({ spacing: { before: 320, after: 80 }, keepNext: true, children: [new TextRun({ text: t, bold: true, font: SERIF, size: 23 })] });
  const kids: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 18, color: RED, space: 6 } },
      spacing: { after: 160 },
      children: [new TextRun({ text: `${course || "Art Appreciation"}  |  Class ${lesson.number}`, font: SANS, size: 17, bold: true, color: RED, smallCaps: true })],
    }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: lesson.topic, font: SERIF, size: 52, bold: true })] }),
  ];
  // The opening: first few words in small caps, the way a magazine article starts.
  if (doc.overview) {
    const words = doc.overview.split(" ");
    const lead = words.slice(0, 4).join(" ");
    kids.push(
      new Paragraph({
        spacing: { after: 120, line: 300 },
        children: [new TextRun({ text: lead, smallCaps: true, font: SERIF, size: 22 }), new TextRun({ text: " " + words.slice(4).join(" "), font: SERIF, size: 22 })],
      }),
    );
  }
  for (const s of doc.sections) {
    if (s.heading) kids.push(crosshead(s.heading));
    s.paragraphs.forEach((p, i) => {
      const refs = p.sources.map((x) => ref(x.url, x.title));
      kids.push(
        new Paragraph({
          spacing: { after: 60, line: 300 },
          indent: i > 0 ? { firstLine: 300 } : undefined,
          children: [new TextRun({ text: p.text, font: SERIF, size: 22 }), sup(refs.length ? refs.join(",") : "?")],
        }),
      );
    });
  }
  if (doc.questions.length) {
    kids.push(crosshead("For discussion"));
    doc.questions.forEach((q, i) =>
      kids.push(new Paragraph({ spacing: { after: 80, line: 290 }, indent: { left: 360, hanging: 360 }, children: [new TextRun({ text: `${i + 1}.\t${q}`, font: SERIF, size: 22 })] })),
    );
  }
  const works = doc.exhibits.filter((e) => e.match);
  if (works.length) {
    kids.push(crosshead("Works to show"));
    works.forEach((e) => {
      const a = e.match!;
      const r = ref(a.url, `${a.museum}: ${a.title}`);
      kids.push(
        new Paragraph({
          spacing: { after: 100, line: 290 },
          indent: { left: 360, hanging: 360 },
          children: [
            new TextRun({ text: "■\t", font: SANS, size: 14, color: RED }),
            new TextRun({ text: a.title, italics: true, font: SERIF, size: 22 }),
            new TextRun({ text: `, ${a.artist}${a.date ? `, ${a.date}` : ""}. ${a.museum === "YouTube" ? "Video on YouTube" : a.museum}.`, font: SERIF, size: 22 }),
            sup(String(r)),
            ...(e.why ? [new TextRun({ text: ` ${e.why}`, font: SERIF, size: 22, color: "444444" })] : []),
          ],
        }),
      );
    });
  }
  kids.push(new Paragraph({ border: { top: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB", space: 6 } }, spacing: { before: 400, after: 80 }, children: [new TextRun({ text: "Sources", font: SANS, size: 16, bold: true, smallCaps: true, color: GREY })] }));
  list.forEach((s, i) =>
    kids.push(
      new Paragraph({
        spacing: { after: 30 },
        indent: { left: 300, hanging: 300 },
        children: [
          new TextRun({ text: `${i + 1}\t${s.title}. `, font: SANS, size: 15, color: GREY }),
          new ExternalHyperlink({ link: s.url.startsWith("/") ? `${location.origin}${s.url}` : s.url, children: [new TextRun({ text: s.url.replace(/^https?:\/\//, "").slice(0, 90), style: "Hyperlink", font: SANS, size: 15 })] }),
        ],
      }),
    ),
  );
  if (doc.sections.some((x) => x.paragraphs.some((p) => !p.sources.length)))
    kids.push(new Paragraph({ spacing: { before: 60 }, children: [new TextRun({ text: "? — not yet confirmed by a source; check before teaching.", font: SANS, size: 15, color: GREY })] }));

  const blob = await Packer.toBlob(
    new Document({
      creator: "pine kitchen",
      title: lesson.topic,
      styles: { default: { document: { run: { font: SERIF, size: 22 } } } },
      sections: [{ properties: { page: { margin: { top: 1300, bottom: 1300, left: 1500, right: 1500 } } }, children: kids }],
    }),
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Class ${String(lesson.number).padStart(2, "0")} - ${lesson.topic}`.replace(/[^\w\s-]/g, "").slice(0, 80) + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Quiz / exit ticket as Word: the student page first, then the answer key on its own page. */
export async function downloadQuiz(lesson: Lesson, course: string) {
  const qz = lesson.quiz;
  if (!qz) return;
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = d;
  const font = "Helvetica";
  const L = "ABCDEFG";
  const p = (text: string, o: { bold?: boolean; italics?: boolean; color?: string; before?: number; size?: number } = {}) =>
    new Paragraph({ spacing: { before: o.before ?? 0, after: 80 }, children: [new TextRun({ text, font, bold: o.bold, italics: o.italics, color: o.color, size: o.size })] });
  const head = `${course} · Class ${lesson.number}`.toUpperCase();
  const kids = [
    p(head, { color: "777777", size: 18 }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${lesson.topic} — quiz`, font })] }),
    p("Name: ______________________________        Date: ______________", { before: 120 }),
  ];
  qz.questions.forEach((q, i) => {
    kids.push(p(`${i + 1}. ${q.q}`, { bold: true, before: 240 }));
    if (q.kind === "choice") q.options!.forEach((o, k) => kids.push(p(`    ${L[k]})  ${o}`)));
    else kids.push(p("______________________________________________________________"), p("______________________________________________________________"));
  });
  if (qz.exit.length) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun({ text: "Exit ticket", font })] }));
    qz.exit.forEach((e) => kids.push(p(e, { before: 120 }), p("______________________________________________________________"), p("______________________________________________________________")));
  }
  kids.push(new Paragraph({ children: [new PageBreak()] }));
  kids.push(p(head, { color: "777777", size: 18 }));
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Answer key (for you)", font })] }));
  qz.questions.forEach((q, i) => {
    const k = q.kind === "choice" ? q.options!.indexOf(q.answer) : -1;
    kids.push(p(`${i + 1}. ${k >= 0 ? `${L[k]})  ` : ""}${q.answer}`, { before: 160 }));
    kids.push(p(`from ${q.from}`, { italics: true, color: "777777", size: 18 }));
  });
  const blob = await Packer.toBlob(new Document({ creator: "pine kitchen", title: `${lesson.topic} quiz`, sections: [{ children: kids }] }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Class ${String(lesson.number).padStart(2, "0")} - ${lesson.topic} - quiz`.replace(/[^\w\s-]/g, "").slice(0, 90) + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
