"use client";
// Audience window (the projector): just the slide, full screen. Follows the presenter view;
// ← → here move the presenter too. Videos play here.
import { useEffect, useRef, useState } from "react";
import { useStudio } from "@/lib/studio";
import SlideView from "./SlideView";

export default function Show({ id }: { id: string }) {
  const { ready, lessons } = useStudio();
  const l = lessons.find((x) => x.id === id);
  const [i, setI] = useState(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const n = l?.slides.length ?? 0;

  useEffect(() => {
    const c = new BroadcastChannel(`pine-show-${id}`);
    chan.current = c;
    c.onmessage = (e) => {
      const d = e.data as { i?: number };
      if (typeof d.i === "number") setI(d.i);
    };
    c.postMessage({ hello: true });
    return () => c.close();
  }, [id]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const step = ["ArrowRight", " ", "PageDown"].includes(e.key) ? 1 : ["ArrowLeft", "PageUp"].includes(e.key) ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setI((x) => Math.max(0, Math.min(n - 1, x + step)));
      chan.current?.postMessage({ nav: step });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);

  if (!ready || !l) return <main className="show" />;
  const s = l.slides[Math.min(i, n - 1)];
  if (!s) return <main className="show" />;
  const vid = s.artworks.find((a) => a.video)?.video;
  return (
    <main className="show" onDoubleClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Double-click for full screen">
      {vid ? (
        <iframe className="showvideo" src={`https://www.youtube-nocookie.com/embed/${vid.id}?rel=0`} title={s.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      ) : (
        <SlideView s={s} n={l.number} />
      )}
    </main>
  );
}
