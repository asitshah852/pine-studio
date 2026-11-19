"use client";
// Left-hand menu in the style of Tanya's own site: name top left, lowercase links,
// courses listed under "classes", the current page in grey.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPass, load, save, setPass, useStatus } from "@/lib/client";
import { OTHER, useStudio } from "@/lib/studio";

const TABS = [
  ["/classes", "classes"],
  ["/prep", "prep"],
  ["/library", "library"],
  ["/checker", "checker"],
  ["/feedback", "feedback"],
] as const;

export default function Nav() {
  const path = usePathname();
  const st = useStatus();
  const { courses } = useStudio();
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

  return (
    <aside className="side">
      <Link href="/classes" className="mark">pine studio</Link>
      <nav aria-label="Sections">
        {TABS.map(([href, label]) => (
          <div key={href}>
            <Link href={href} aria-current={path.startsWith(href) ? "page" : undefined}>{label}</Link>
            {href === "/classes" && courses.filter((c) => c.id !== OTHER).length > 0 && (
              <div className="sub">
                {courses.filter((c) => c.id !== OTHER).map((c) => (
                  <Link key={c.id} href={`/classes#c-${c.id}`}>{c.name.toLowerCase()}</Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
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
          <label>studio passcode</label>
          <input className="input" type="password" value={pass} onChange={(e) => setP(e.target.value)} autoFocus />
          <button className="btn solid sm">unlock</button>
        </form>
      )}
    </aside>
  );
}
