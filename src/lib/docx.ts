"use client";
// The research document as a Word file she can keep and edit. Sources are numbered [1], [2]…
import type { Lesson } from "./types";
import { caption } from "./museum";

export async function downloadDocx(lesson: Lesson, course: string) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink } = d;
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
  const font = "Helvetica";
  const kids = [
    new Paragraph({ children: [new TextRun({ text: `${course} · Class ${lesson.number}`.toUpperCase(), size: 18, color: "777777", font })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: lesson.topic, font })] }),
    ...(lesson.premise ? [new Paragraph({ children: [new TextRun({ text: lesson.premise, italics: true, font })] })] : []),
    ...(doc.overview ? [new Paragraph({ spacing: { before: 200 }, children: [new TextRun({ text: doc.overview, font })] })] : []),
  ];
  for (const s of doc.sections) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun({ text: s.heading, font })] }));
    for (const p of s.paragraphs) {
      const refs = p.sources.map((x) => ref(x.url, x.title));
      kids.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: p.text, font }),
            new TextRun({ text: refs.length ? ` [${refs.join(", ")}]` : " [unverified]", font, color: "777777" }),
          ],
        }),
      );
    }
  }
  if (doc.questions.length) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun({ text: "Discussion questions", font })] }));
    doc.questions.forEach((q) => kids.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: q, font })] })));
  }
  const works = doc.exhibits.filter((e) => e.match);
  if (works.length) {
    kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun({ text: "Exhibits", font })] }));
    works.forEach((e) =>
      kids.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({ text: caption(e.match!), font }),
            new TextRun({ text: e.why ? ` — ${e.why}` : "", font, color: "555555" }),
            new TextRun({ text: ` [${ref(e.match!.url, `${e.match!.museum}: ${e.match!.title}`)}]`, font, color: "777777" }),
          ],
        }),
      ),
    );
  }
  kids.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300 }, children: [new TextRun({ text: "Sources", font })] }));
  list.forEach((s, i) =>
    kids.push(
      new Paragraph({
        children: [
          new TextRun({ text: `[${i + 1}] ${s.title} — `, font, size: 18 }),
          new ExternalHyperlink({ link: s.url, children: [new TextRun({ text: s.url, style: "Hyperlink", font, size: 18 })] }),
        ],
      }),
    ),
  );
  const blob = await Packer.toBlob(new Document({ creator: "pine studio", title: lesson.topic, sections: [{ children: kids }] }));
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
  const blob = await Packer.toBlob(new Document({ creator: "pine studio", title: `${lesson.topic} quiz`, sections: [{ children: kids }] }));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `Class ${String(lesson.number).padStart(2, "0")} - ${lesson.topic} - quiz`.replace(/[^\w\s-]/g, "").slice(0, 90) + ".docx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
