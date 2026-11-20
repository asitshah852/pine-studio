"use client";
// Text you edit by simply clicking into it (title, summary). Saves when you click away;
// Enter saves a one-line field, Esc undoes.
export default function Inline({ value, onSave, multiline, placeholder, className }: { value: string; onSave: (v: string) => void; multiline?: boolean; placeholder?: string; className?: string }) {
  return (
    <span
      key={value}
      className={`inline-edit ${className ?? ""}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline={!!multiline}
      data-placeholder={placeholder}
      onBlur={(e) => {
        const v = (e.currentTarget.innerText ?? "").replace(/ /g, " ").trim();
        if (v !== value.trim() && (v || multiline)) onSave(v);
        else e.currentTarget.innerText = value;
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.innerText = value;
          e.currentTarget.blur();
        }
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    >
      {value}
    </span>
  );
}
