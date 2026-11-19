# pine studio

A teaching studio for an undergraduate **Art Appreciation** course in Chicago. Built for Tanya
(adjunct professor of art, MFA in photography). Minimal black-and-white design; "Darkroom" is
the dark mode. Works on laptop (prep) and phone (review).

| Tab | What it does |
|-----|--------------|
| **01 Classes** | Courses (e.g. "Art Appreciation 103") with their classes by number and topic. **+ existing class** uploads materials she already has: PowerPoint (.pptx) becomes editable slides with notes and pictures; PDF, Word and text are kept as class materials. **suggest improvements** on every class opens it in Prep for a review: fact checks (sourced), specific changes she can apply or dismiss, new discussion points, exhibits from the museums. Open a class: **Present** (full screen), **PowerPoint ↓**, **Document ↓** (research as Word), slides with speaker notes, research document, sources & readings. Add / rename / delete courses; delete classes. |
| **02 Prep** | Four steps. **1 Brief:** course, class #, topic, premise. **2 Research:** a 1–2 page document (every paragraph sourced or marked "?"), discussion questions, and suggested exhibits matched to real records at the Art Institute, the Met and Cleveland — tick the ones to use; edit or delete anything; download as Word. **3 Slides:** "Make slides from research" builds the deck (titles, short talking points, plain-language speaker notes, chosen exhibits placed); edit under each slide; add more exhibits, textbook points, her own images; drag frames to reorder. **4 Check & finish:** fact-check every slide, then **Ready for class →**. |
| **03 Library** | Checked list of free and open resources plus City Colleges and Chicago Public Library access; "Find free" searches open libraries for any title. |
| **04 Checker** | Paste text or drop screenshots/PDFs: each claim → ✓ / ? / ✗ with the page that backs it. |
| **05 Feedback** | Tanya's change requests per tab, ticked off when done. |

## Ground rules (fact-checking)
- **Nothing is made up.** Claude writes framing, outlines and questions; facts must come with a
  source URL that web search actually returned in the same request. Any other URL is thrown
  away and the fact is marked **unverified** (`groundSources` in `src/lib/claude.ts`).
- Artwork captions (artist, title, date, medium, credit line) come **only from the museum record**
  and link to the museum page.
- Textbook points come only from the uploaded pages; pasted-text quotes are checked word for word.
- A class can't be marked **Ready** until every slide has been checked since its last edit and no
  ✗ remains; unverified facts need her explicit confirmation.
- Images: public-domain works go in at full size; works still in copyright use the museum's own
  preview and are flagged **rights: check** on the slide and in the deck's credits slide.
- Every deck ends with a **Sources & image credits** slide.

## Run it
```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY to switch on research/fact-check
npm run dev                  # http://localhost:3000
npm test
```
Without keys: Library, Classes, Exhibits, slides, .pptx, Present and Feedback all work (saved in
the browser). Research, Textbook and Checker need `ANTHROPIC_API_KEY`. See **SETUP.md** to deploy.

## Code map
```
src/lib/claude.ts    Claude calls (Opus 5.5, web search, source grounding, refusal fallback)
src/lib/prompts.ts   research (document + exhibits) · makeSlides · fromTextbook · factCheck
src/lib/studio.ts    courses + classes (upgrades older saved data)
src/lib/docx.ts      research document as Word
src/lib/importers.ts upload: .pptx → slides; .pdf/.docx/.txt → materials (text kept in /api/file)
src/components/Improve.tsx  materials + suggest improvements
src/lib/museum.ts    AIC / Met / Cleveland open-access search + caption builder
src/lib/slides.ts    slide building, drag-drop, fact-check state, readiness gate
src/lib/pptx.ts      .pptx export in the browser (pptxgenjs)
src/lib/starter.ts   checked starter library + "find free" links
src/lib/client.ts    collections (browser + shared Upstash), passcode, image helpers
src/components/      Library · Classes · Prep · Checker · Feedback · SlideView · Nav
src/app/api/         status · store · museum · img (museum image proxy) · research · textbook · check · feedback
```
