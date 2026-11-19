# pine studio

A teaching studio for an undergraduate **Art Appreciation** course in Chicago. Built for Tanya
(adjunct professor of art, MFA in photography). Minimal black-and-white design; "Darkroom" is
the dark mode. Works on laptop (prep) and phone (review).

| Tab | What it does |
|-----|--------------|
| **01 Library** | Textbooks, journals, papers, museums, websites. Starts with a checked list of **free and open** resources (open textbooks, Smarthistory, the Met's Heilbrunn Timeline, Getty and Met free books, Artstor public collections, AIC/NGA/LOC open images) plus **City Colleges of Chicago** library and **Chicago Public Library** access. "Find free" searches Open Textbook Library, OER Commons, Internet Archive, JSTOR, CPL and WorldCat for any title. Add / edit / filter. |
| **02 Classes** | Finished, fact-checked classes grouped by unit: slide contact sheet, **Present** (full screen, arrow keys), **Download .pptx**, readings, every source. Send back to Prep to change. |
| **03 Prep** | The workbench for the next class. Left drawer: **Research** (Claude + web search; every fact keeps its source page), **Textbook** (upload pages or paste a passage → points with page number and exact quote), **Exhibits** (Art Institute of Chicago, The Met, Cleveland Museum of Art open-access search), **Library** (assign readings), **My images** (her own photos). **Drag anything onto the slide or the film strip.** Edit title, points, notes, layout (title / text / artwork / compare). **Fact-check deck**, then **Ready for class →** moves it to Classes. |
| **04 Checker** | Paste text or drop screenshots/PDFs (e.g. a deck saved as PDF, a handout): every factual claim → ✓ supported / ? unverified / ✗ wrong + fix, each with the page that backs it. |
| **05 Feedback** | Tanya's change requests per tab, ticked off when done; optionally emailed. |

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
src/lib/prompts.ts   research · fromTextbook · factCheck
src/lib/museum.ts    AIC / Met / Cleveland open-access search + caption builder
src/lib/slides.ts    slide building, drag-drop, fact-check state, readiness gate
src/lib/pptx.ts      .pptx export in the browser (pptxgenjs)
src/lib/starter.ts   checked starter library + "find free" links
src/lib/client.ts    collections (browser + shared Upstash), passcode, image helpers
src/components/      Library · Classes · Prep · Checker · Feedback · SlideView · Nav
src/app/api/         status · store · museum · img (museum image proxy) · research · textbook · check · feedback
```
