# pine studio

A teaching studio for an undergraduate **Art Appreciation** course in Chicago. Built for Tanya
(adjunct professor of art, MFA in photography). Minimal black-and-white design; "Darkroom" is
the dark mode. Works on laptop (prep) and phone (review).

| Tab | What it does |
|-----|--------------|
| **Home** | The next class to prepare, where it stands, and one button for the next step (e.g. **make my class**). Search everything with **⌘K**. |
| **01 Classes** | Courses (e.g. "Art Appreciation 103") with their classes by number and topic. **+ existing class** uploads materials she already has: PowerPoint (.pptx) becomes editable slides with notes and pictures; PDF, Word and text are kept as class materials. **suggest improvements** on every class opens it in Prep for a review: fact checks (sourced), specific changes she can apply or dismiss, new discussion points, exhibits from the museums. Open a class: **Present** (full screen), **PowerPoint ↓**, **Document ↓** (research as Word), slides with speaker notes, research document, sources & readings. Add / rename / delete courses; delete classes. |
| **02 Prep** | Four steps. **1 Brief:** course, class #, topic, premise. **2 Research:** a 1–2 page document (every paragraph sourced or marked "?"), discussion questions, and suggested exhibits matched to real records at the Art Institute, the Met and Cleveland — tick the ones to use; edit or delete anything; download as Word. **3 Slides:** "Make slides from research" builds the deck (titles, the text on each slide, her talking points, chosen exhibits placed); type straight onto the slide with a formatting bar (bold, italic, bullets, text size); under each slide a **talking points** box for what she'll say while it's up (segue, context, a question; never shown on the slide; goes to presenter view and PowerPoint notes); add more exhibits, textbook points, her own images; drag frames to reorder. **4 Check & finish:** fact-check every slide, then **Ready for class →**. Back / next under every step. **talk it through** (bottom right): chat with Claude about the class; it can edit or add slides and research, add questions and find museum exhibits, with undo. |
| **Presenter view** | Class page → **presenter view** (or **▶ present** in Prep): her laptop shows this slide, its talking points, the next slide and a class clock (counts down from the class length); **open audience window** opens just the slide for the projector (double-click for full screen). Arrow keys on either window move both. |
| **Semester planner** | Classes → **plan the semester** on a course: weeks, classes a week, length, her themes → a suggested order of classes (topic + one-line premise; no facts — those are researched per class). Edit and tick; **add ticked classes**, or **add & make them** to build each one in turn while the page is open ("carry on making them" if it was closed). |
| **Clip button** | Menu → **clip button**: drag "+ pine studio" to the bookmarks bar. On any page, click it: museum object pages (AIC / Met / Cleveland) and YouTube videos become exhibits (caption from the museum's own record); other pages become a source the class's research reads and cites, or go to the Library. |
| **Reuse slides** | Prep slides → **+ add an exhibit or slides** → **from another class**: tick slides, copy them in after the current one (their fact-check is redone). |
| **Quiz / exit ticket** | Class page or Prep step 4: 3–10 questions written only from this class's research and slides, each answer traced to the paragraph or slide it comes from; 2 exit-ticket prompts. **Word** (student page + answer key on its own page) or **print / PDF**. |
| **03 Library** | Checked list of free and open resources plus City Colleges and Chicago Public Library access. Each entry says how pine studio uses it: "searched by pine studio for exhibits" (AIC, Met, Cleveland, Library of Congress), "research prefers this site" (research is told to favour these sites), "your stored copy — research reads it", or "a link to browse". |
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
src/components/Presenter.tsx, Show.tsx   presenter view (/present/<id>) + audience window (/show/<id>), synced by BroadcastChannel
src/components/Planner.tsx   semester planner + make-queue (pine.makequeue)
src/components/Clip.tsx      clip button setup (/clipper) and clip window (/clip?u=&t=&s=)
src/components/QuizBox.tsx, QuizPrint.tsx   quiz / exit ticket (lib/make.ts runQuiz, docx.ts downloadQuiz, /quiz/<id>)
src/app/api/         status · store · museum · img (museum image proxy) · research · textbook · check · feedback · quiz · plan · clip
```
