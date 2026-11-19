"use client";
// Fact-check results. Default (compact): one summary line; only wrong facts (✗) show, each with the
// suggested wording and "use this wording" / "it's fine". Everything else sits behind "details".
// The Checker page passes `full` to see every claim with its sources.
import { useState } from "react";
import type { Claim } from "@/lib/types";

export const vClass = (v: Claim["verdict"]) => (v === "supported" ? "ok" : v === "contradicted" ? "bad" : "unv");
const vLabel = { supported: "Supported", contradicted: "Wrong", unverified: "Unverified" };

type Props = {
  claims: Claim[];
  full?: boolean;
  onConfirm?: (index: number, confirmed: boolean) => void;
  /** Swap the suggested wording into the slide; return false if the exact words weren't found. */
  onUseFix?: (index: number) => boolean;
};

const short = (t: string, n = 140) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function Full({ claims }: { claims: Claim[] }) {
  if (!claims.length) return <p className="mute">No checkable facts found.</p>;
  const order = { contradicted: 0, unverified: 1, supported: 2 };
  return (
    <div className="claims">
      {[...claims].sort((a, b) => order[a.verdict] - order[b.verdict]).map((c, i) => (
        <div key={i}>
          <span className={`v ${vClass(c.verdict)}`}>{vLabel[c.verdict]}</span> {c.text}
          {c.fix && <div className="fix"><b>Suggested:</b> {c.fix}</div>}
          <div className="src">
            {c.sources.length
              ? c.sources.slice(0, 3).map((s, j) => <span key={j}>{j ? " · " : ""}<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></span>)
              : "No source found — check it yourself or take it out."}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Claims({ claims, full, onConfirm, onUseFix }: Props) {
  const [open, setOpen] = useState(false);
  const [missed, setMissed] = useState<number | null>(null);
  if (full) return <Full claims={claims} />;
  if (!claims.length) return <p className="mute" style={{ margin: "4px 0 0" }}>Nothing to check on this slide.</p>;

  const wrong = claims.map((c, i) => ({ c, i })).filter(({ c }) => c.verdict === "contradicted");
  const ok = claims.filter((c) => c.verdict === "supported").length;
  const unv = claims.filter((c) => c.verdict === "unverified").length;

  return (
    <div className="claims compact">
      <div className="claimsum">
        <span className="v ok">{ok} checked</span>
        {unv > 0 && <span className="v unv">{unv} unconfirmed</span>}
        {wrong.length > 0 && <span className="v bad">{wrong.length} to look at</span>}
        <button className="linkish" onClick={() => setOpen(!open)}>{open ? "hide details" : "details"}</button>
      </div>

      {wrong.map(({ c, i }) => (
        <div key={i} className="wrongfact">
          <div><span className="v bad" /> {short(c.text)}</div>
          {c.fix && <div className="fix">→ {short(c.fix, 220)}</div>}
          <div className="row" style={{ gap: 16 }}>
            {c.fix && onUseFix && (
              <button className="btn sm solid" onClick={() => { if (!onUseFix(i)) setMissed(i); }}>use this wording</button>
            )}
            {onConfirm && <button className="btn sm ghost" onClick={() => onConfirm(i, true)}>it’s fine</button>}
          </div>
          {missed === i && <div className="mute" style={{ fontSize: 16 }}>Couldn’t find those exact words on the slide — edit the talking points by hand.</div>}
        </div>
      ))}

      {open && (
        <div className="claimdetails">
          {claims.map((c, i) => (
            <div key={i}>
              <span className={`v ${vClass(c.verdict)}`} title={c.confirmed ? "confirmed by you" : vLabel[c.verdict]} /> {short(c.text)}
              {c.sources[0] ? (
                <> · <a className="mute" href={c.sources[0].url} target="_blank" rel="noreferrer">{short(c.sources[0].title, 50)}</a></>
              ) : c.confirmed ? <span className="mute"> · confirmed by you</span> : null}
              {c.verdict === "unverified" && onConfirm && <> · <button className="linkish" onClick={() => onConfirm(i, true)}>it’s right</button></>}
              {c.confirmed && onConfirm && <> · <button className="linkish" onClick={() => onConfirm(i, false)}>undo</button></>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
