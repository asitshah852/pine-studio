// Example classes so the prototype isn't empty. Labelled "Example" in the app; they contain
// discussion prompts only (no factual claims), so there's nothing unsourced in them.
import type { Lesson } from "./types";

export const SEED_LESSONS: Lesson[] = [
  {
    id: "example-1",
    number: 1,
    topic: "How to look at a work of art",
    unit: "Foundations",
    summary: "Slow looking: describe, analyse, interpret, judge.",
    readings: ["starter-1"],
    status: "ready",
    readyAt: "2026-11-19T00:00:00.000Z",
    example: true,
    slides: [
      { id: "e1a", layout: "title", title: "How to look at a work of art", body: "Slow looking, out loud", notes: "Welcome. Phones face down for ten minutes.", images: [], artworks: [], sources: [], check: { at: "2026-11-19T00:00:00.000Z", claims: [] } },
      { id: "e1b", layout: "text", title: "Four steps", body: "Describe: what do you see? (no opinions yet)\nAnalyse: how is it made and arranged?\nInterpret: what might it mean?\nJudge: does it work? why?", notes: "Model the steps on one image before pairs try it.", images: [], artworks: [], sources: [], check: { at: "2026-11-19T00:00:00.000Z", claims: [] } },
      { id: "e1c", layout: "text", title: "Pair exercise (10 min)", body: "Pick one image from the handout\nEach person only describes for 3 minutes\nThen swap and interpret\nShare one surprise with the room", notes: "", images: [], artworks: [], sources: [], check: { at: "2026-11-19T00:00:00.000Z", claims: [] } },
    ],
  },
  {
    id: "example-2",
    number: 2,
    topic: "Photography: document or art?",
    unit: "Photography",
    summary: "Draft: research, exhibits and slides still to add.",
    readings: [],
    status: "draft",
    example: true,
    slides: [
      { id: "e2a", layout: "title", title: "Photography: document or art?", body: "", notes: "", images: [], artworks: [], sources: [] },
      { id: "e2b", layout: "text", title: "Warm-up question", body: "When did you last take a photo you thought of as 'art'?\nWhat made it different from the others on your phone?", notes: "", images: [], artworks: [], sources: [] },
    ],
  },
];
