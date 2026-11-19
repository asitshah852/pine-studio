"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getPass, load, save, setPass, useStatus } from "@/lib/client";

const TABS = [
  ["/library", "Library"],
  ["/classes", "Classes"],
  ["/prep", "Prep"],
  ["/checker", "Checker"],
  ["/feedback", "Feedback"],
] as const;

export default function Nav() {
  const path = usePathname();
  const st = useStatus();
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
    <div className="top">
      {needPass && (
        <form
          className="passbar"
          onSubmit={(e) => {
            e.preventDefault();
            setPass(pass);
            setNeedPass(false);
            location.reload();
          }}
        >
          <span>Enter the studio passcode to save and use research tools.</span>
          <input type="password" value={pass} onChange={(e) => setP(e.target.value)} aria-label="Passcode" />
          <button className="btn sm">Unlock</button>
        </form>
      )}
      <header className="bar">
        <Link href="/prep" className="mark">
          pine <i>studio</i>
        </Link>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([href, label], i) => (
            <Link key={href} href={href} className="tab mono" aria-current={path.startsWith(href) ? "page" : undefined}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              {label}
            </Link>
          ))}
        </nav>
        <div className="tools">
          <span
            className="mono mute"
            title={st ? `Research & fact-check: ${st.claude ? "on" : "off (no API key yet)"}. Saving: ${st.db ? "shared across devices" : "this browser only"}.` : ""}
          >
            <span className={`dot ${st?.claude ? "on" : ""}`} />
            {st ? (st.claude ? "research on" : "research off") : "…"}
          </span>
          <button className="btn ghost sm" onClick={toggle} aria-pressed={dark} title="Darkroom mode">
            {dark ? "Daylight" : "Darkroom"}
          </button>
        </div>
      </header>
    </div>
  );
}
