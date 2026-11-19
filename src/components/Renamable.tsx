"use client";
// A name you can change by right-clicking it: it turns into a text box; Enter saves, Esc cancels.
import { useState } from "react";

export default function Renamable({ value, display, onSave, className }: { value: string; display?: string; onSave: (v: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const done = (save: boolean) => {
    if (save && v.trim() && v.trim() !== value) onSave(v.trim());
    setEditing(false);
  };
  if (editing)
    return (
      <input
        autoFocus
        onFocus={(e) => e.target.select()}
        className={`rename ${className ?? ""}`}
        value={v}
        size={Math.max(8, v.length + 1)}
        onChange={(e) => setV(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") done(true);
          if (e.key === "Escape") done(false);
        }}
        onBlur={() => done(true)}
        aria-label="New name"
      />
    );
  return (
    <span
      className={className}
      title="Right-click to rename"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setV(value);
        setEditing(true);
      }}
    >
      {display ?? value}
    </span>
  );
}
