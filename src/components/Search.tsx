"use client";
// Search everything (⌘K / Ctrl+K): courses, classes, slides, research, exhibits and the library.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCollection } from "@/lib/client";
import { STARTER_RESOURCES } from "@/lib/starter";
import { OTHER, pad, useStudio } from "@/lib/studio";
import type { Resource } from "@/lib/types";

type Hit = { kind: string; title: string; detail: string; href: string; text: string };

export default function Search() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { courses, lessons, courseName } = useStudio();
  const { items: resources } = useCollection<Resource>("resources", STARTER_RESOURCES);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const o = () => setOpen(true);
    window.addEventListener("keydown", k);
    window.addEventListener("pine:search", o);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("pine:search", o);
    };
  }, []);
  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const index = useMemo<Hit[]>(() => {
    const out: Hit[] = [];
    for (const c of courses) if (c.id !== OTHER) out.push({ kind: "course", title: c.name, detail: `${lessons.filter((l) => l.courseId === c.id).length} classes`, href: `/classes#c-${c.id}`, text: c.name });
    for (const l of lessons) {
      const where = `${courseName(l.courseId)} · class ${pad(l.number)}`;
      out.push({ kind: "class", title: l.topic, detail: where, href: `/classes?open=${l.id}`, text: `${l.topic} ${l.premise}` });
      l.slides.forEach((s, n) => {
        out.push({ kind: "slide", title: s.title || `Slide ${n + 1}`, detail: `${where} · slide ${pad(n + 1)}`, href: `/prep?lesson=${l.id}&slide=${s.id}`, text: `${s.title} ${s.body} ${s.notes}` });
        for (const a of s.artworks) out.push({ kind: "exhibit", title: a.title, detail: `${a.museum} · in ${where}`, href: `/prep?lesson=${l.id}&slide=${s.id}`, text: `${a.title} ${a.artist}` });
      });
      for (const sec of l.research?.sections ?? [])
        for (const p of sec.paragraphs) out.push({ kind: "research", title: sec.heading, detail: `${where} · ${p.text.slice(0, 90)}…`, href: `/prep?lesson=${l.id}&step=2`, text: `${sec.heading} ${p.text}` });
      for (const e of [...(l.research?.exhibits ?? []), ...(l.review?.exhibits ?? [])])
        if (e.match) out.push({ kind: "exhibit", title: e.match.title, detail: `${e.match.museum} · suggested for ${where}`, href: `/prep?lesson=${l.id}&step=2`, text: `${e.match.title} ${e.match.artist} ${e.why}` });
    }
    for (const r of resources) out.push({ kind: "library", title: r.title, detail: [r.author, r.kind].filter(Boolean).join(" · "), href: `/library?q=${encodeURIComponent(r.title)}`, text: `${r.title} ${r.author ?? ""} ${r.topics.join(" ")} ${r.notes}` });
    return out;
  }, [courses, lessons, resources, courseName]);

  const hits = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const order = ["class", "course", "slide", "exhibit", "research", "library"];
    return index
      .filter((h) => words.every((w) => h.text.toLowerCase().includes(w)))
      .sort((a, b) => Number(words.every((w) => b.title.toLowerCase().includes(w))) - Number(words.every((w) => a.title.toLowerCase().includes(w))) || order.indexOf(a.kind) - order.indexOf(b.kind))
      .slice(0, 40);
  }, [q, index]);

  const go = (h: Hit) => {
    setOpen(false);
    router.push(h.href);
  };

  if (!open) return null;
  return (
    <div className="search-back" onClick={() => setOpen(false)}>
      <div className="search" role="dialog" aria-label="Search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={input}
          className="input"
          placeholder="Search classes, slides, research, exhibits, library…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            if (e.key === "Enter" && hits[i]) go(hits[i]);
          }}
        />
        <div className="search-hits">
          {q && !hits.length && <p className="mute">Nothing found.</p>}
          {hits.map((h, n) => (
            <button key={n} className={`hit ${n === i ? "on" : ""}`} onMouseEnter={() => setI(n)} onClick={() => go(h)}>
              <span className="mono mute kind">{h.kind}</span>
              <span className="grow">
                <span className="t">{h.title}</span>
                <span className="mute d">{h.detail}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mute" style={{ fontSize: 15, marginTop: 8 }}>↑ ↓ to move · enter to open · esc to close</div>
      </div>
    </div>
  );
}
