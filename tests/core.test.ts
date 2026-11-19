import { test } from "node:test";
import assert from "node:assert/strict";
import { groundSources, normUrl, parseJson } from "../src/lib/claude";
import { caption, isMatch } from "../src/lib/museum";
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

test("any edit clears the check; unchecked slides are flagged but never block", () => {
  const checked = { ...blankSlide("text", "A"), body: "fact", check: { at: "t", claims: [] } };
  assert.equal(slideState(checked), "ok");
  const edited = addTo(checked, { kind: "text", text: "new fact", sources: [], verified: false });
  assert.equal(slideState(edited), "unchecked");
  const lesson = (slides: Lesson["slides"]): Lesson => ({ id: "l", courseId: "c", number: 1, topic: "t", premise: "", readings: [], status: "draft", slides });
  // Unchecked or unverified slides are notes, not a gate: she can always move ahead.
  assert.equal(readiness(lesson([edited])).ok, true);
  assert.equal(readiness(lesson([edited])).clean, false);
  const bad = { ...checked, check: { at: "t", claims: [{ text: "x", verdict: "contradicted" as const, sources: [] }] } };
  assert.equal(readiness(lesson([checked, bad])).problems, 1);
  assert.equal(readiness(lesson([checked])).clean, true);
  assert.equal(readiness(lesson([])).ok, false);
});

test("deck sources are de-duplicated", () => {
  const a = slideFrom({ kind: "artwork", artwork: art() });
  const b = slideFrom({ kind: "artwork", artwork: art() });
  assert.equal(deckSources([a, b]).length, 1);
});

test("suggested works only attach to a matching museum record", () => {
  const rec = art({ title: "A Sunday on La Grande Jatte — 1884", artist: "Georges Seurat\nFrench, 1859–1891" });
  assert.equal(isMatch(rec, "A Sunday on La Grande Jatte", "Georges Seurat"), true);
  assert.equal(isMatch(rec, "A Sunday on La Grande Jatte", "Paul Signac"), false);
  assert.equal(isMatch(rec, "Nighthawks", "Georges Seurat"), false);
});

test("dropping an artwork on a title slide turns it into an artwork slide", () => {
  const s = addTo(blankSlide("title", "Intro"), { kind: "artwork", artwork: art() });
  assert.equal(s.layout, "artwork");
});

test("applying a suggestion rewrites the slide or adds one after it, and clears its check", async () => {
  const { applySuggestion } = await import("../src/lib/slides");
  const a = { ...blankSlide("text", "Old"), check: { at: "t", claims: [] } };
  const b = blankSlide("text", "Next");
  const base = { id: "s", kind: "content" as const, text: "x", sources: [{ title: "Src", url: "https://example.org/a" }], verified: true, status: "open" as const };
  const changed = applySuggestion([a, b], { ...base, slideId: a.id, change: { title: "New" } });
  assert.equal(changed[0].title, "New");
  assert.equal(changed[0].check, undefined);
  assert.equal(changed[0].sources.length, 1);
  const added = applySuggestion([a, b], { ...base, slideId: a.id, newSlide: { title: "Extra", body: "p", notes: "n" } });
  assert.deepEqual(added.map((s) => s.title), ["Old", "Extra", "Next"]);
});

test("saving merges with the online copy instead of overwriting it", async () => {
  const { mergeLists, diffIds } = await import("../src/lib/merge");
  type I = { id: string; v: number };
  const online: I[] = [{ id: "a", v: 2 }, { id: "b", v: 2 }, { id: "c", v: 1 }]; // b updated on the phone, c added there
  const laptop: I[] = [{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "d", v: 1 }]; // old tab: edits a? no — adds d, deletes nothing
  const before: I[] = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
  const d = diffIds(before, laptop);
  assert.deepEqual(d, { changed: ["d"], deleted: [] });
  const merged = mergeLists(online, laptop, new Set(d.changed), new Set(d.deleted));
  assert.deepEqual(merged, [{ id: "a", v: 2 }, { id: "b", v: 2 }, { id: "d", v: 1 }, { id: "c", v: 1 }]);
  // a deletion here and an edit here both win
  assert.deepEqual(mergeLists(online, [{ id: "a", v: 9 }], new Set(["a"]), new Set(["b"])), [{ id: "a", v: 9 }, { id: "c", v: 1 }]);
});

test("replacing research or slides keeps the old one to restore", async () => {
  const { withResearch, withSlides, restore } = await import("../src/lib/lessonOps");
  const doc = (at: string) => ({ at, overview: at, sections: [], questions: [], exhibits: [] });
  let l: import("../src/lib/types").Lesson = { id: "l", courseId: "c", number: 1, topic: "t", premise: "", readings: [], slides: [blankSlide("text", "A")], status: "draft", research: doc("first") };
  l = withResearch(l, doc("second"));
  l = withSlides(l, [blankSlide("text", "B")]);
  assert.equal(l.research?.overview, "second");
  assert.equal(l.versions?.filter((v) => v.kind === "research").length, 1);
  l = restore(l, l.versions!.find((v) => v.kind === "research")!);
  assert.equal(l.research?.overview, "first");
  assert.equal(l.versions?.find((v) => v.kind === "research")?.research?.overview, "second");
  l = restore(l, l.versions!.find((v) => v.kind === "slides")!);
  assert.equal(l.slides[0].title, "A");
});

test("chat changes apply to slides and research, and undo restores them", async () => {
  const { withChat, undoChat } = await import("../src/lib/lessonOps");
  const a = blankSlide("text", "One");
  const b = blankSlide("text", "Two");
  const l0: import("../src/lib/types").Lesson = { id: "l", courseId: "c", number: 1, topic: "t", premise: "", readings: [], slides: [a, b], status: "draft" };
  const user = { id: "u1", role: "user" as const, text: "go", at: "t" };
  const l1 = withChat(l0, user, {
    reply: "Done.",
    sources: [],
    ops: [
      { op: "edit_slide", label: "Edited slide 1", slideId: a.id, title: "One, better" },
      { op: "add_slide", label: "Added", afterId: a.id, title: "New", body: "x\ny" },
      { op: "move_slide", label: "Moved", slideId: b.id, to: 1 },
      { op: "add_exhibit", label: "Added work", artwork: art(), why: "fits", slideId: a.id },
      { op: "add_paragraph", label: "Added research", text: "Fact.", sources: [], verified: false },
    ],
  });
  assert.deepEqual(l1.slides.map((s) => s.title), ["Two", "One, better", "New"]);
  assert.equal(l1.slides[1].layout, "artwork");
  assert.equal(l1.research?.exhibits.length, 1);
  assert.equal(l1.research?.sections[0].paragraphs[0].verified, false);
  assert.equal(l1.chat?.length, 2);
  const back = undoChat(l1, l1.chat![1].id);
  assert.deepEqual(back.slides.map((s) => s.title), ["One", "Two"]);
  assert.equal(back.research, undefined);
});

test("Library of Congress results: images and rights from each item's own record", async () => {
  const { parseLoc, rightsFrom } = await import("../src/lib/sources");
  const [a] = parseLoc([{ url: "https://www.loc.gov/item/2017000001/", title: "Example photograph", date: "1936", contributor: ["Example, Photographer"], image_url: ["//tile.loc.gov/x/small.gif", "https://tile.loc.gov/x/a.jpg#h=100&w=80", "https://tile.loc.gov/x/b.jpg#h=1000&w=800"] }]);
  assert.equal(a.thumbUrl, "https://tile.loc.gov/x/a.jpg");
  assert.equal(a._big, "https://tile.loc.gov/x/b.jpg");
  assert.equal(a.publicDomain, false);
  assert.equal(rightsFrom({ rights_advisory: ["No known restrictions on publication."] }).free, true);
  assert.equal(rightsFrom({ rights_advisory: "Publication may be restricted." }).free, false);
  assert.equal(rightsFrom(undefined).free, false);
});

test("YouTube results become linked video exhibits, never treated as free images", async () => {
  const { parseYouTube } = await import("../src/lib/sources");
  const [v] = parseYouTube([{ id: { videoId: "abc123" }, snippet: { title: "Example &amp; Song (Official Video)", channelTitle: "ExampleVEVO", publishedAt: "1981-08-01T00:00:00Z" } }]);
  assert.equal(v.title, "Example & Song (Official Video)");
  assert.equal(v.video?.id, "abc123");
  assert.equal(v.publicDomain, false);
  assert.equal(caption(v), "Example & Song (Official Video). ExampleVEVO on YouTube, 1981.");
  const s = slideFrom({ kind: "artwork", artwork: v });
  assert.equal(s.images[0].rights, "check");
  assert.equal(s.images[0].url, "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
});

test("'I've checked this' turns an unverified fact into a confirmed one, and back", async () => {
  const { confirmClaim } = await import("../src/lib/lessonOps");
  const sl = { ...blankSlide("text", "A"), body: "x", check: { at: "t", claims: [{ text: "fact", verdict: "unverified" as const, sources: [] }] } };
  const l0: import("../src/lib/types").Lesson = { id: "l", courseId: "c", number: 1, topic: "t", premise: "", readings: [], slides: [sl], status: "draft" };
  assert.equal(readiness(l0).unverified, 1);
  const l1 = confirmClaim(l0, sl.id, 0, true);
  assert.equal(l1.slides[0].check?.claims[0].confirmed, true);
  assert.equal(readiness(l1).unverified, 0);
  assert.equal(readiness(l1).clean, true);
  assert.equal(confirmClaim(l1, sl.id, 0, false).slides[0].check?.claims[0].verdict, "unverified");
});

test("page ranges come out of a stored textbook's text", async () => {
  const { slicePages } = await import("../src/lib/textbooks");
  const all = "--- Page 1 ---\nOne.\n\n--- Page 2 ---\nTwo.\n\n--- Page 3 ---\nThree.";
  assert.equal(slicePages(all, 2, 3), "[PDF page 2]\nTwo.\n\n[PDF page 3]\nThree.");
  assert.equal(slicePages(all, 5, 6), "");
});

test("finds the PDF download link on a book's page", async () => {
  const { pdfLinks } = await import("../src/lib/pdflinks");
  const html = `<a href="/about">About</a><a href="/formats/123">EPUB</a><a href="/formats/456"><span>PDF</span></a><a href="https://x.org/book.pdf">read</a><a href="/files/book.docx">Download Word</a>`;
  assert.deepEqual(pdfLinks(html, "https://open.example.edu/textbooks/1"), ["https://open.example.edu/formats/456", "https://x.org/book.pdf"]);
  const { nextPages } = await import("../src/lib/pdflinks");
  const bepress = `<a href="https://oer.galileo.usg.edu/cgi/viewcontent.cgi?article=1002&amp;context=arts-textbooks">Download</a>`;
  assert.deepEqual(pdfLinks(bepress, "https://oer.galileo.usg.edu/arts-textbooks/3"), ["https://oer.galileo.usg.edu/cgi/viewcontent.cgi?article=1002&context=arts-textbooks"]);
  assert.deepEqual(nextPages(`<a href="/download/9">Download this book</a>`, "https://a.edu/x"), ["https://a.edu/download/9"]);
});

test("research picks the textbook pages that match the topic", async () => {
  const { bestPages } = await import("../src/lib/textbooks");
  const filler = " The figure stands against a plain ground.".repeat(8);
  const all = [
    `--- Page 1 ---\nPreface and acknowledgements.${filler}`,
    `--- Page 2 ---\nImpressionism began in Paris; Monet painted light and atmosphere outdoors. Impressionism changed painting.${filler}`,
    `--- Page 3 ---\nPhotography arrived in 1839 and painters such as Degas used photographs.${filler}`,
  ].join("\n\n");
  const top = bestPages(all, "Impressionism and the camera: how photography changed painting");
  assert.equal(top[0].page, 2);
  assert.ok(top.some((p) => p.page === 3));
  assert.ok(!top.some((p) => p.page === 1));
});
