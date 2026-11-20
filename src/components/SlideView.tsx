"use client";
// A slide, drawn at 16:9. In Prep it is edited in place: click the title or the text to type
// (formatting bar above the slide), hover a picture to remove it.
import { useEffect, useRef } from "react";
import { proxied } from "@/lib/client";
import { fromHtml, parseBody, toHtml, type Para } from "@/lib/slideText";
import { caption } from "@/lib/museum";
import type { Slide } from "@/lib/types";

const src = (u: string) => proxied(u);
// A YouTube thumbnail's video id (i.ytimg.com/vi/<id>/…), so the editor can play it in place.
const ytId = (u: string) => u.match(/i\.ytimg\.com\/vi\/([\w-]{11})\//)?.[1];
const Player = ({ id, title }: { id: string; title: string }) => (
  <iframe className="yt" src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`} title={title} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
);
const RIGHTS = { "public-domain": "free to use", own: "yours", check: "rights: check" } as const;

type Edit = { onTitle: (t: string) => void; onRemoveImage: (i: number) => void; onBody?: (b: string) => void };

/** The slide's own text: bullets and paragraphs with bold / italic. */
export function Body({ body, className = "sb" }: { body: string; className?: string }) {
  const paras = parseBody(body);
  if (!paras.length) return null;
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const line = (p: Para) => p.runs.map((r, k) => (r.b ? <b key={k}>{r.text}</b> : r.i ? <i key={k}>{r.text}</i> : <span key={k}>{r.text}</span>));
  paras.forEach((p, i) => {
    if (p.bullet) list.push(<li key={i}>{line(p)}</li>);
    else {
      if (list.length) { out.push(<ul key={`u${i}`}>{list}</ul>); list = []; }
      out.push(<p key={i}>{line(p)}</p>);
    }
  });
  if (list.length) out.push(<ul key="u-end">{list}</ul>);
  return <div className={className}>{out}</div>;
}

/** The slide's text, typed straight onto the slide (formatting from the bar above it). */
function EditBody({ s, onBody }: { s: Slide; onBody: (b: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(s.body);
  useEffect(() => {
    // refresh only when the text changed from outside (chat, undo, another slide)
    if (ref.current && document.activeElement !== ref.current && (shown.current !== s.body || !ref.current.innerHTML)) {
      ref.current.innerHTML = toHtml(s.body);
      shown.current = s.body;
    }
  }, [s.id, s.body]);
  const save = () => {
    if (!ref.current) return;
    const b = fromHtml(ref.current as unknown as Parameters<typeof fromHtml>[0]);
    shown.current = b;
    if (b !== s.body) onBody(b);
  };
  return (
    <div
      ref={ref}
      className="sb sbedit"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={s.layout === "title" ? "Click to add a subtitle" : "Click to add text to the slide"}
      onBlur={save}
      onInput={() => { clearTimeout((ref.current as unknown as { t?: number })?.t); (ref.current as unknown as { t?: number }).t = window.setTimeout(save, 900); }}
      onPaste={(e) => {
        // paste as plain text, one line per paragraph
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    />
  );
}

export default function SlideView({ s, n, edit }: { s: Slide; n?: number; edit?: Edit }) {
  const layout = s.layout === "compare" && s.images.length < 2 ? (s.images.length ? "artwork" : "text") : s.layout;
  const body = edit?.onBody ? <EditBody s={s} onBody={edit.onBody} /> : <Body body={s.body} />;
  const remove = (i: number) =>
    edit ? (
      <span className="imgtools">
        <span className="rights-tag">{RIGHTS[s.images[i].rights]}</span>
        <button type="button" onClick={() => edit.onRemoveImage(i)} aria-label="Remove picture">remove ×</button>
      </span>
    ) : null;
  const title = edit ? (
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
  );

  return (
    <div className={`slide ${layout} ${edit ? "editable" : ""}`} style={{ "--k": s.size ?? 1 } as React.CSSProperties}>
      {layout === "title" && n !== undefined && <div className="tag">CLASS {String(n).padStart(2, "0")}</div>}
      {layout === "artwork" && (
        <div className="si">
          {s.images[0] && edit && ytId(s.images[0].url) ? (
            <Player id={ytId(s.images[0].url)!} title={s.images[0].credit} />
          ) : s.images[0] ? (
            <img src={src(s.images[0].url)} alt={s.images[0].credit} />
          ) : (
            <div className="ph">{edit ? "Add a picture or video below, or drop one here" : "No picture"}</div>
          )}
          {s.images[0] && ytId(s.images[0].url) && !edit && <span className="play" aria-hidden="true">▶</span>}
          {s.images[0] && remove(0)}
        </div>
      )}
      {layout === "compare" ? (
        <>
          {title}
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
        </>
      ) : (
        <div className="sx">
          {title}
          {layout === "artwork" && <div className="cap">{s.artworks[0] ? caption(s.artworks[0]) : s.images[0]?.credit}</div>}
          {body}
        </div>
      )}
    </div>
  );
}
