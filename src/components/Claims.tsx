import type { Claim } from "@/lib/types";

export const vClass = (v: Claim["verdict"]) => (v === "supported" ? "ok" : v === "contradicted" ? "bad" : "unv");
const vLabel = { supported: "Supported", contradicted: "Wrong", unverified: "Unverified" };

export default function Claims({ claims }: { claims: Claim[] }) {
  if (!claims.length) return <p className="mute">No checkable facts found.</p>;
  const order = { contradicted: 0, unverified: 1, supported: 2 };
  return (
    <div className="claims">
      {[...claims].sort((a, b) => order[a.verdict] - order[b.verdict]).map((c, i) => (
        <div key={i}>
          <span className={`v ${vClass(c.verdict)}`}>{vLabel[c.verdict]}</span> {c.text}
          {c.fix && <div className="fix"><b>Fix:</b> {c.fix}</div>}
          <div className="src">
            {c.sources.length
              ? c.sources.map((s, j) => (
                  <span key={j}>
                    {j ? " · " : ""}
                    <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                  </span>
                ))
              : "No source found — check it yourself or take it out."}
          </div>
        </div>
      ))}
    </div>
  );
}
