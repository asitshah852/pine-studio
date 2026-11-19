import { test } from "node:test";
import assert from "node:assert/strict";
import { groundSources, normUrl, parseJson } from "../src/lib/claude";
import { caption } from "../src/lib/museum";
import { addTo, blankSlide, deckSources, readiness, slideFrom, slideState } from "../src/lib/slides";
import type { Artwork, Lesson } from "../src/lib/types";

const art = (over: Partial<Artwork> = {}): Artwork => ({
  museum: "Art Institute of Chicago", id: "1", title: "Example Work", artist: "Example Artist", date: "1900",
  medium: "Oil on canvas", credit: "Example Fund", url: "https://www.artic.edu/artworks/1", publicDomain: true,
  imageUrl: "https://www.artic.edu/iiif/2/x/full/1686,/0/default.jpg", ...over,
});

test("only sources web search actually returned survive", () => {
  const got = new Map([[normUrl("https://www.metmuseum.org/essays/x?y=1"), "Met essay"]]);
  const out = groundSources([{ title: "Met", url: "https://metmuseum.org/essays/x/" }, { title: "Made up", url: "https://example.com/fake" }], got);
  assert.deepEqual(out.map((s) => s.title), ["Met"]);
});

test("parseJson tolerates prose and fences", () => {
  assert.deepEqual(parseJson<{ a: number }>('Here you go:\n```json\n{"a":1}\n```\nDone.'), { a: 1 });
  assert.throws(() => parseJson("no json here"));
});

test("museum caption is built from the record only", () => {
  assert.equal(caption(art()), "Example Artist. Example Work, 1900. Oil on canvas. Art Institute of Chicago. Example Fund");
});

test("dropping artworks fills image, source, title; two make a compare slide", () => {
  let s = slideFrom({ kind: "artwork", artwork: art() });
  assert.equal(s.layout, "artwork");
  assert.equal(s.title, "Example Work");
  assert.equal(s.images[0].rights, "public-domain");
  s = addTo(s, { kind: "artwork", artwork: art({ id: "2", title: "Second", url: "https://www.artic.edu/artworks/2" }) });
  assert.equal(s.layout, "compare");
  assert.equal(s.sources.length, 2);
});

test("a copyrighted work gets a preview flagged rights: check", () => {
  const s = slideFrom({ kind: "artwork", artwork: art({ publicDomain: false, imageUrl: undefined, thumbUrl: "https://www.artic.edu/iiif/2/x/full/400,/0/default.jpg" }) });
  assert.equal(s.images[0]?.rights, "check");
});

test("any edit clears the check; ready needs every slide checked and no errors", () => {
  const checked = { ...blankSlide("text", "A"), body: "fact", check: { at: "t", claims: [] } };
  assert.equal(slideState(checked), "ok");
  const edited = addTo(checked, { kind: "text", text: "new fact", sources: [], verified: false });
  assert.equal(slideState(edited), "unchecked");
  const lesson = (slides: Lesson["slides"]): Lesson => ({ id: "l", number: 1, topic: "t", summary: "", readings: [], status: "draft", slides });
  assert.equal(readiness(lesson([edited])).ok, false);
  const bad = { ...checked, check: { at: "t", claims: [{ text: "x", verdict: "contradicted" as const, sources: [] }] } };
  assert.equal(readiness(lesson([checked, bad])).problems, 1);
  assert.equal(readiness(lesson([checked])).ok, true);
});

test("deck sources are de-duplicated", () => {
  const a = slideFrom({ kind: "artwork", artwork: art() });
  const b = slideFrom({ kind: "artwork", artwork: art() });
  assert.equal(deckSources([a, b]).length, 1);
});
