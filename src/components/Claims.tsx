import type { Claim } from "@/lib/types";

export const vClass = (v: Claim["verdict"]) => (v === "supported" ? "ok" : v === "contradicted" ? "bad" : "unv");
const vLabel = { supported: "Supported", contradicted: "Wrong", unverified: "Unverified" };

/** A list of checked claims. With onConfirm, unverified ones get an "I've checked this" button. */
export default function Claims({ claims, onConfirm }: { claims: Claim[]; onConfirm?: (index: number, confirmed: boolean) => void }) {
  if (!claims.length) return <p className="mute">No checkable facts found.</p>;
  const order = { contradicted: 0, unverified: 1, supported: 2 };
  return (
    <div className="claims">
      {claims
        .map((c, i) => ({ c, i }))
        .sort((a, b) => order[a.c.verdict] - order[b.c.verdict])
        .map(({ c, i }) => (
          <div key={i}>
            <span className={`v ${vClass(c.verdict)}`}>{c.confirmed ? "Confirmed by you" : vLabel[c.verdict]}</span> {c.text}
            {c.fix && <div className="fix"><b>Fix:</b> {c.fix}</div>}
            <div className="src">
              {c.sources.length
                ? c.sources.map((s, j) => (
                    <span key={j}>
                      {j ? " · " : ""}
                      <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                    </span>
                  ))
                : c.confirmed
                  ? "You confirmed this yourself."
                  : "No source found — check it yourself or take it out."}
            </div>
            {onConfirm && c.verdict === "unverified" && (
              <button className="btn sm" onClick={() => onConfirm(i, true)}>I’ve checked this — it’s right</button>
            )}
            {onConfirm && c.confirmed && (
              <button className="btn sm ghost" onClick={() => onConfirm(i, false)}>undo</button>
            )}
          </div>
        ))}
    </div>
  );
}
