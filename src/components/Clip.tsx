"use client";
// The clip button: a bookmark in her browser's bookmarks bar. On any museum page, article or YouTube
// video, one click opens this small window to send the page to a class (as an exhibit or as a source
// research must read) or to the Library. Opened without a page, it shows how to set the button up.
import { useEffect, useMemo, useState } from "react";
import { load, proxied, save, uid, useCollection } from "@/lib/client";
import { caption } from "@/lib/museum";
import { slideFrom } from "@/lib/slides";
import { STARTER_RESOURCES } from "@/lib/starter";
import { pad, useStudio } from "@/lib/studio";
import type { Artwork, Lesson, Resource } from "@/lib/types";

type Kind = { kind: "video" | "artwork" | "page"; artwork?: Artwork; note?: string };

export default function Clip({ setup = false }: { setup?: boolean }) {
  const { ready, lessons, courses, updateLessons, courseName } = useStudio();
  const { update: updateResources } = useCollection<Resource>("resources", STARTER_RESOURCES);
  const [p, setP] = useState<{ u: string; t: string; s: string } | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [what, setWhat] = useState<Kind | null>(null);
  const [to, setTo] = useState("");
  const [done, setDone] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setOrigin(window.location.origin);
    const u = q.get("u") ?? "";
    if (!u) return;
    setP({ u, t: q.get("t") ?? "", s: q.get("s") ?? "" });
    setTitle(q.get("t") || u);
    setText(q.get("s") ?? "");
    fetch(`/api/clip?url=${encodeURIComponent(u)}`).then((r) => r.json()).then(setWhat).catch(() => setWhat({ kind: "page" }));
  }, []);

  // classes in prep first, newest course order; remember the last class she clipped to
  const options = useMemo(() => {
    const sorted = [...lessons].sort((a, b) => (a.status === b.status ? courses.findIndex((c) => c.id === a.courseId) - courses.findIndex((c) => c.id === b.courseId) || a.number - b.number : a.status === "draft" ? -1 : 1));
    return sorted;
  }, [lessons, courses]);
  useEffect(() => {
    if (!ready || to) return;
    const last = load<string>("pine.clip.last", "");
    setTo(lessons.some((l) => l.id === last) ? last : options[0]?.id ?? "");
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLesson = (fn: (l: Lesson) => Lesson) => updateLessons((cur) => cur.map((l) => (l.id === to ? fn(l) : l)));
  const finish = (msg: string) => {
    save("pine.clip.last", to);
    setDone(msg);
    setTimeout(() => window.close(), 1800);
  };
  const lesson = lessons.find((l) => l.id === to);

  function asExhibit() {
    const a = what?.artwork;
    if (!a || !lesson) return;
    setLesson((l) =>
      l.research
        ? { ...l, research: { ...l.research, exhibits: l.research.exhibits.some((e) => e.match?.url === a.url) ? l.research.exhibits : [...l.research.exhibits, { id: uid(), suggested: a.title, why: text.trim() || "Clipped from your browser.", match: a, use: true }] } }
        : { ...l, slides: [...l.slides, slideFrom({ kind: "artwork", artwork: a })] },
    );
    finish(lesson.research ? `Added to “your exhibits” in ${lesson.topic}.` : `Added as a new slide at the end of ${lesson.topic}.`);
  }
  function asSource() {
    if (!p || !lesson) return;
    setLesson((l) => ({ ...l, clips: [...(l.clips ?? []).filter((c) => c.url !== p.u), { id: uid(), url: p.u, title: title.trim() || p.u, text: text.trim().slice(0, 4000) || undefined, at: new Date().toISOString() }] }));
    finish(`Saved to ${lesson.topic}. Research for this class will read it as a source.`);
  }
  function toLibrary() {
    if (!p) return;
    const kind: Resource["kind"] = what?.kind === "video" ? "video" : what?.kind === "artwork" ? "museum" : "website";
    updateResources((cur) => (cur.some((r) => r.url === p.u) ? cur : [...cur, { id: uid(), kind, title: title.trim() || p.u, url: p.u, topics: [], notes: text.trim().slice(0, 1000), addedAt: new Date().toISOString() }]));
    save("pine.clip.last", to);
    setDone("Saved to your Library.");
    setTimeout(() => window.close(), 1800);
  }

  const bookmarklet = origin
    ? `javascript:(()=>{const s=String(getSelection()).slice(0,1500);window.open('${origin}/clip?u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent(document.title)+'&s='+encodeURIComponent(s),'pineclip','popup,width=560,height=720')})()`
    : "";

  if (setup || !p)
    return (
      <main className="page clipsetup">
        <h1>the clip button</h1>
        <p>Send any museum page, article or YouTube video to a class with one click, from any website.</p>
        <ol className="steps-list">
          <li>Show your bookmarks bar: in Chrome or Edge press <b>⌘ Shift B</b> (Mac) or <b>Ctrl Shift B</b> (Windows); in Safari choose View → Show Favorites Bar.</li>
          <li>Drag this button up onto the bookmarks bar: {bookmarklet && <a className="clipbtn" href={bookmarklet} onClick={(e) => { e.preventDefault(); alert("Drag this button onto your bookmarks bar (don’t click it here)."); }}>＋ pine studio</a>}</li>
          <li>On any page, click <b>＋ pine studio</b> in the bookmarks bar. A small window opens: pick the class and send it. Highlight a passage first to keep that passage too.</li>
        </ol>
        <p className="mute">What happens to a clip: a museum object page (Art Institute of Chicago, The Met, Cleveland) or a YouTube video becomes an exhibit, with the caption taken from the museum’s own record. Any other page is kept as a source the research for that class reads and cites, or saved to your Library.</p>
      </main>
    );

  return (
    <main className="clip">
      <div className="mark">pine studio</div>
      {done ? (
        <p className="clipdone">✓ {done}</p>
      ) : (
        <>
          <label className="label">title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="mute small cliphost">{p.u.replace(/^https?:\/\//, "").slice(0, 90)}</div>
          {!what ? (
            <p className="mute">Looking at this page…</p>
          ) : what.artwork ? (
            <div className="clipwork">
              {what.artwork.thumbUrl && <img src={proxied(what.artwork.thumbUrl)} alt="" />}
              <div>
                <div>{caption(what.artwork)}</div>
                <div className="mute small">{what.kind === "video" ? "YouTube video (linked and played from YouTube)" : what.artwork.publicDomain ? "public domain" : "rights: check — museum preview only"}</div>
              </div>
            </div>
          ) : (
            <p className="mute small">A web page{what.note ? ` (${what.note})` : ""}. It will be kept as a source, not an exhibit.</p>
          )}
          <label className="label">{what?.artwork ? "why it’s useful (optional)" : "passage to keep (optional — highlight text before clicking the button)"}</label>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
          <label className="label">send to class</label>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            {!options.length && <option value="">no classes yet</option>}
            {options.map((l) => <option key={l.id} value={l.id}>{courseName(l.courseId)} · {pad(l.number)} {l.topic}{l.status === "ready" ? " (ready)" : ""}</option>)}
          </select>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 14 }}>
            {what?.artwork && <button className="btn solid" disabled={!lesson} onClick={asExhibit}>add as an exhibit</button>}
            <button className={`btn ${what?.artwork ? "" : "solid"}`} disabled={!lesson || !what} onClick={asSource}>add as a source for research</button>
            <button className="linkish" onClick={toLibrary} disabled={!what}>save to Library</button>
          </div>
          {!ready && <p className="mute small">Loading your classes…</p>}
        </>
      )}
    </main>
  );
}
