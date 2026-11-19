"use client";
// A slide, drawn at 16:9. In Prep it can be edited in place: click the title to type,
// hover a picture to remove it.
import { proxied } from "@/lib/client";
import { caption } from "@/lib/museum";
import type { Slide } from "@/lib/types";

const src = (u: string) => proxied(u);
// A YouTube thumbnail's video id (i.ytimg.com/vi/<id>/…), so the editor can play it in place.
const ytId = (u: string) => u.match(/i\.ytimg\.com\/vi\/([\w-]{11})\//)?.[1];
const Player = ({ id, title }: { id: string; title: string }) => (
  <iframe className="yt" src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`} title={title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
);
const RIGHTS = { "public-domain": "free to use", own: "yours", check: "rights: check" } as const;

type Edit = { onTitle: (t: string) => void; onRemoveImage: (i: number) => void };

export default function SlideView({ s, n, edit }: { s: Slide; n?: number; edit?: Edit }) {
  const bullets = s.body.split("\n").map((t) => t.trim()).filter(Boolean);
  const list = bullets.length ? (
    <div className="sb">
      {s.layout === "title" ? bullets.join(" · ") : <ul>{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
    </div>
  ) : null;
  const layout = s.layout === "compare" && s.images.length < 2 ? (s.images.length ? "artwork" : "text") : s.layout;
  const remove = (i: number) =>
    edit ? (
      <span className="imgtools">
        <span className="rights-tag">{RIGHTS[s.images[i].rights]}</span>
        <button type="button" onClick={() => edit.onRemoveImage(i)} aria-label="Remove picture">remove ×</button>
      </span>
    ) : null;

  return (
    <div className={`slide ${layout} ${edit ? "editable" : ""}`}>
      {layout === "title" && n !== undefined && <div className="tag">CLASS {String(n).padStart(2, "0")}</div>}
      {layout === "artwork" && (
        <>
          <div className="si">
            {s.images[0] && edit && ytId(s.images[0].url) ? (
              <Player id={ytId(s.images[0].url)!} title={s.images[0].credit} />
            ) : s.images[0] ? (
              <img src={src(s.images[0].url)} alt={s.images[0].credit} />
            ) : (
              <div className="ph">{edit ? "Add an exhibit from the right, or drop one here" : "No picture"}</div>
            )}
            {s.images[0] && ytId(s.images[0].url) && !edit && <span className="play" aria-hidden="true">▶</span>}
            {s.images[0] && remove(0)}
          </div>
          <div className="cap">{s.artworks[0] ? caption(s.artworks[0]) : s.images[0]?.credit}</div>
        </>
      )}
      {layout === "compare" && (
        <div className="pair">
          {s.images.slice(0, 2).map((im, i) => (
            <div key={i}>
              <div className="im">
                {edit && ytId(im.url) ? <Player id={ytId(im.url)!} title={im.credit} /> : <img src={src(im.url)} alt={im.credit} />}
                {!edit && ytId(im.url) && <span className="play" aria-hidden="true">▶</span>}
                {remove(i)}
              </div>
              <div className="cap">{im.credit}</div>
            </div>
          ))}
        </div>
      )}
      {edit ? (
        <div
          className="st"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-placeholder="Click to add a title"
          onBlur={(e) => {
            const t = (e.currentTarget.textContent ?? "").trim();
            if (t !== s.title) edit.onTitle(t);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
            }
          }}
          key={`${s.id}-${s.title}`}
        >
          {s.title}
        </div>
      ) : (
        <div className="st">{s.title}</div>
      )}
      {(layout === "text" || layout === "title") && list}
    </div>
  );
}
