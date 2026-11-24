"use client";
// Left-hand menu in the style of Tanya's own site: name top left, lowercase links,
// courses listed under "classes", the current page in grey.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getPass, load, save, setPass, useStatus } from "@/lib/client";
import { OTHER, useStudio } from "@/lib/studio";
import Renamable from "./Renamable";
import Search from "./Search";

const TABS = [
  ["/", "home"],
  ["/classes", "classes"],
  ["/library", "library"],
] as const;
// Less-used pages, folded under "more".
const MORE = [
  ["/checker", "checker", "check any text, screenshot or PDF for facts"],
  ["/feedback", "feedback", "ask for a change to pine kitchen"],
  ["/clipper", "clip button", "send any web page to a class from your bookmarks bar"],
] as const;

export default function Nav() {
  const path = usePathname();
  const params = useSearchParams();
  const st = useStatus();
  const { courses, lessons, updateCourses } = useStudio();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [needPass, setNeedPass] = useState(false);
  const [pass, setP] = useState("");

  useEffect(() => {
    setDark(load<string>("pine.theme", "light") === "dark");
    const on = () => setNeedPass(true);
    window.addEventListener("pine:need-passcode", on);
    return () => window.removeEventListener("pine:need-passcode", on);
  }, []);
  useEffect(() => {
    if (st?.passcode && !getPass()) setNeedPass(true);
  }, [st]);

  function toggle() {
    const next = !dark;
    setDark(next);
    save("pine.theme", next ? "dark" : "light");
    document.documentElement.dataset.theme = next ? "dark" : "light";
  }

  // The course being shown (?course=… or the course of an open class) is greyed like the current page.
  const here = path === "/classes" ? params.get("course") || lessons.find((l) => l.id === params.get("open"))?.courseId || null
    : path === "/prep" ? lessons.find((l) => l.id === params.get("lesson"))?.courseId || params.get("course") || null : null;
  if (/^\/(handout|present|show|clip|quiz)(\/|$)/.test(path)) return null; // pages that stand on their own
  return (
    <aside className="side">
      <Link href="/" className="mark">pine kitchen</Link>
      <nav aria-label="Sections">
        {TABS.map(([href, label]) => (
          <div key={href}>
            <Link href={href} aria-current={(href === "/" ? path === "/" : (path.startsWith(href) || (href === "/classes" && path.startsWith("/prep"))) && !(href === "/classes" && here)) ? "page" : undefined}>{label}</Link>
            {href === "/classes" && courses.filter((c) => c.id !== OTHER).length > 0 && (
              <div className="sub" title="Drag to reorder · right-click to rename">
                {courses.filter((c) => c.id !== OTHER).map((c) => (
                  <div
                    key={c.id}
                    className={`subitem ${dragId === c.id ? "dragging" : ""} ${overId === c.id && dragId !== c.id ? "over" : ""}`}
                    draggable
                    onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/x-pine-course", c.id); }}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(c.id); } }}
                    onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragId;
                      setDragId(null);
                      setOverId(null);
                      if (!from || from === c.id) return;
                      updateCourses((cur) => {
                        const next = cur.filter((x) => x.id !== from);
                        const moved = cur.find((x) => x.id === from)!;
                        const at = next.findIndex((x) => x.id === c.id);
                        const fromIdx = cur.findIndex((x) => x.id === from);
                        const toIdx = cur.findIndex((x) => x.id === c.id);
                        next.splice(fromIdx < toIdx ? at + 1 : at, 0, moved);
                        return next;
                      });
                    }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                  >
                    <Link href={`/classes?course=${c.id}`} draggable={false} aria-current={here === c.id ? "page" : undefined}>
                      <Renamable value={c.name} display={c.name.toLowerCase()} onSave={(name) => updateCourses((cur) => cur.map((x) => (x.id === c.id ? { ...x, name, example: false } : x)))} />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
      <details className="navmore" open={MORE.some(([h]) => path.startsWith(h))}>
        <summary>more</summary>
        {MORE.map(([href, label, hint]) => (
          <Link key={href} href={href} title={hint} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</Link>
        ))}
      </details>
      <button className="linkish searchlink" onClick={() => window.dispatchEvent(new Event("pine:search"))}>search <span className="mute">⌘K</span></button>
      <Search />
      <div className="foot">
        <span title={st ? `Research & fact-check: ${st.claude ? "on" : "off"}. Saving: ${st.db ? "shared across devices" : "this browser only"}.` : ""}>
          {st ? (st.claude ? "research on" : "research off") : ""}
        </span>
        <button className="linkish" onClick={toggle} aria-pressed={dark}>{dark ? "daylight" : "darkroom"}</button>
      </div>
      {needPass && (
        <form
          className="passbox"
          onSubmit={(e) => {
            e.preventDefault();
            setPass(pass);
            setNeedPass(false);
            location.reload();
          }}
        >
          <label>kitchen passcode</label>
          <input className="input" type="password" value={pass} onChange={(e) => setP(e.target.value)} autoFocus />
          <button className="btn solid sm">unlock</button>
        </form>
      )}
    </aside>
  );
}
