"use client";
import { proxied } from "@/lib/client";
import { caption } from "@/lib/museum";
import type { Slide } from "@/lib/types";

const src = (u: string) => proxied(u);

export default function SlideView({ s, n }: { s: Slide; n?: number }) {
  const bullets = s.body.split("\n").map((t) => t.trim()).filter(Boolean);
  const list = bullets.length ? (
    <div className="sb">
      {s.layout === "title" ? bullets.join(" · ") : <ul>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
    </div>
  ) : null;
  const layout = s.layout === "compare" && s.images.length < 2 ? (s.images.length ? "artwork" : "text") : s.layout === "artwork" && !s.images.length ? "artwork" : s.layout;

  return (
    <div className={`slide ${layout}`}>
      {layout === "title" && n !== undefined && <div className="tag">CLASS {String(n).padStart(2, "0")}</div>}
      {layout === "artwork" && (
        <>
          <div className="si">
            {s.images[0] ? <img src={src(s.images[0].url)} alt={s.images[0].credit} /> : <div className="ph">Drop an artwork here</div>}
          </div>
          <div className="cap">{s.artworks[0] ? caption(s.artworks[0]) : s.images[0]?.credit}</div>
        </>
      )}
      {layout === "compare" && (
        <div className="pair">
          {s.images.slice(0, 2).map((im, i) => (
            <div key={i}>
              <div className="im"><img src={src(im.url)} alt={im.credit} /></div>
              <div className="cap">{im.credit}</div>
            </div>
          ))}
        </div>
      )}
      <div className="st">{s.title}</div>
      {(layout === "text" || layout === "title") && list}
    </div>
  );
}
