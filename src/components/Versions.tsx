"use client";
// "earlier versions (n)": research documents, slide decks or reviews that were replaced or deleted.
import { useState } from "react";
import { restore } from "@/lib/lessonOps";
import type { Lesson, Version } from "@/lib/types";

export default function Versions({ lesson, kind, set }: { lesson: Lesson; kind: Version["kind"]; set: (fn: (l: Lesson) => Lesson) => void }) {
  const [open, setOpen] = useState(false);
  const list = (lesson.versions ?? []).filter((v) => v.kind === kind);
  if (!list.length) return null;
  return (
    <span className="versions">
      <button className="btn sm ghost" onClick={() => setOpen(!open)}>earlier versions ({list.length})</button>
      {open && (
        <span className="vlist">
          {list.map((v) => (
            <span key={v.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="mute">{v.label}</span>
              <button className="btn sm" onClick={() => { if (confirm("Restore this version? What's there now will be kept as an earlier version.")) { set((l) => restore(l, v)); setOpen(false); } }}>restore</button>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
