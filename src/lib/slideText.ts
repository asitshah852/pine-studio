// The text ON a slide, stored as simple lines: "- " starts a bullet, any other line is a plain
// paragraph; **bold** and *italic* inside a line. Pure functions (tested in tests/core.test.ts),
// shared by the slide, the on-slide editor, PowerPoint export and the fact-check.

export type Run = { text: string; b?: boolean; i?: boolean };
export type Para = { bullet: boolean; runs: Run[] };

const BUL = /^\s*(?:[-•*]\s+|•)/;

/** Inline **bold** / *italic* → runs. */
export function runs(line: string): Run[] {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let at = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], b: true } : { text: m[2], i: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out.filter((r) => r.text);
}

export function parseBody(body: string): Para[] {
  return (body ?? "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => (BUL.test(l) ? { bullet: true, runs: runs(l.replace(BUL, "").trim()) } : { bullet: false, runs: runs(l.trim()) }));
}

/** The words only (for the fact-check, quiz, search). */
export const plainBody = (body: string) => parseBody(body).map((p) => p.runs.map((r) => r.text).join("")).join("\n");

/** Text written by Claude (one point per line, no markers) becomes bullets on text slides. */
export function normBody(body: string, layout: string): string {
  const lines = (body ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (layout !== "text" || !lines.length || lines.some((l) => BUL.test(l))) return lines.join("\n");
  return lines.map((l) => `- ${l}`).join("\n");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const runHtml = (r: Run) => (r.b ? `<b>${esc(r.text)}</b>` : r.i ? `<i>${esc(r.text)}</i>` : esc(r.text));

/** Lines → HTML for the on-slide editor (and back with fromHtml). */
export function toHtml(body: string): string {
  let html = "";
  let inList = false;
  for (const p of parseBody(body)) {
    if (p.bullet && !inList) { html += "<ul>"; inList = true; }
    if (!p.bullet && inList) { html += "</ul>"; inList = false; }
    const inner = p.runs.map(runHtml).join("") || "<br>";
    html += p.bullet ? `<li>${inner}</li>` : `<div>${inner}</div>`;
  }
  return inList ? html + "</ul>" : html;
}

type NodeLike = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<NodeLike>; getAttribute?: (n: string) => string | null };

/** The edited slide text (a contentEditable element) → lines. */
export function fromHtml(root: NodeLike): string {
  const lines: string[] = [];
  let cur = "";
  let bullet = false;
  const flush = () => {
    const t = cur.replace(/ /g, " ").replace(/\*\*\s*\*\*/g, "").replace(/\s+/g, " ").trim();
    if (t) lines.push(bullet ? `- ${t}` : t);
    cur = "";
  };
  const inline = (n: NodeLike, b: boolean, i: boolean): void => {
    if (n.nodeType === 3) {
      const t = n.textContent ?? "";
      cur += b && t.trim() ? `**${t}**` : i && t.trim() ? `*${t}*` : t;
      return;
    }
    const tag = n.nodeName.toUpperCase();
    if (tag === "BR") return flush();
    if (tag === "UL" || tag === "OL") {
      flush();
      for (const c of Array.from(n.childNodes)) {
        bullet = true;
        inline(c, b, i);
        flush();
      }
      bullet = false;
      return;
    }
    if (tag === "LI") { for (const c of Array.from(n.childNodes)) inline(c, b, i); return; }
    const style = (n.getAttribute?.("style") ?? "").toLowerCase();
    const nb = b || tag === "B" || tag === "STRONG" || /font-weight:\s*(bold|[6-9]00)/.test(style);
    const ni = i || tag === "I" || tag === "EM" || /font-style:\s*italic/.test(style);
    const block = tag === "DIV" || tag === "P" || /^H[1-6]$/.test(tag);
    if (block) flush();
    for (const c of Array.from(n.childNodes)) inline(c, nb && !b ? true : b, ni && !i ? true : i);
    if (block) flush();
  };
  // bold/italic of a whole element wraps its text once, not each piece
  for (const c of Array.from(root.childNodes)) inline(c, false, false);
  flush();
  return lines.join("\n").replace(/\*\*\*\*/g, "");
}
