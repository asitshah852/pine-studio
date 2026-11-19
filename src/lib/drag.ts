// Drag-and-drop payloads between the Prep panels and the slide strip.
import type { Artwork, Source } from "./types";

export type DragItem =
  | { kind: "artwork"; artwork: Artwork }
  | { kind: "text"; heading?: string; text: string; sources: Source[]; verified: boolean }
  | { kind: "image"; url: string; credit: string; rights: "own" | "check" };

export const MIME = "application/x-pine";

export function startDrag(e: React.DragEvent, item: DragItem) {
  e.dataTransfer.setData(MIME, JSON.stringify(item));
  e.dataTransfer.setData("text/plain", item.kind === "artwork" ? item.artwork.title : item.kind === "text" ? item.text : item.credit);
  e.dataTransfer.effectAllowed = "copy";
}

export function readDrag(e: React.DragEvent): DragItem | null {
  const raw = e.dataTransfer.getData(MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragItem;
  } catch {
    return null;
  }
}
