"use client";
// Shown while Claude is working: a turning circle, a running clock, and what it is doing.
import { useEffect, useState } from "react";

export default function Working({ what, doing, usual, since }: { what: string; doing: string; usual: string; since?: number }) {
  const [t, setT] = useState(() => (since ? Math.floor((Date.now() - since) / 1000) : 0));
  useEffect(() => {
    const start = since ?? Date.now();
    const i = setInterval(() => setT(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    const before = document.title.replace(/^● .*? · /, "");
    document.title = `● ${what.toLowerCase()}… · ${before}`;
    return () => {
      document.title = before;
    };
  }, [what]);
  const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  return (
    <div className="working" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <div>
          {what}… <span className="mute">{clock}</span>
        </div>
        <div className="mute small">
          {doing}. Usually {usual}{t > 240 ? " — taking longer than usual, but still working" : ""}. Keep this page open.
        </div>
      </div>
    </div>
  );
}
