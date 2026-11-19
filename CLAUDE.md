# Instructions for Claude — read first

## Who you're working with
- The owner (Asit) is **not a coder**. Plain English, short numbered steps, a recommendation not a menu.
- If you can do a task yourself, ask permission first, then do it.
- The user of the app is **Tanya**, Asit's daughter: adjunct professor of art teaching undergraduate
  Art Appreciation in Chicago (City Colleges of Chicago and/or other colleges), MFA in photography.
  Her change requests arrive through the Feedback tab.

## The project
- Name: **pine studio** (always lower case). Repo `asitshah852/pine-studio`, separate from other projects.
- Tabs (Asit, Nov 2026): Classes (by course) · Prep (1 Brief → 2 Research doc + questions + exhibits → 3 auto slides with one talking-points box per slide → 4 Check & finish) · Library · Checker · Feedback. See README.md.
- Prep brief is just course, class number, topic and premise (no dates/units).
- She has already taught some classes (Asit, Nov 2026): Classes → "+ existing class" uploads her materials (pptx → slides; pdf/docx → materials); "suggest improvements" next to every class sends it to Prep for a sourced review she accepts or dismisses item by item.
- Classes page (Asit, Nov 2026): no top "new class" button (classes are added inside each course); courses reorder by dragging in the sidebar; right-click any course or class name to rename it.
- Slides (Asit, Nov 2026): ONE "talking points" box per slide — 3–5 short bullets; on exhibit slides they link the research to the work on screen. No separate speaker notes. Artwork slides show only the work + caption; talking points go in the PowerPoint presenter notes (text slides also show them on the slide).
- Prep (Asit, Nov 2026): back/next bar under every step. "talk it through" chat panel (src/lib/chat.ts, components/Talk.tsx): Claude discusses the class and changes it via tools — edit/add/delete/move slides, edit/add research paragraphs (sources must be retrieved, else marked unverified), add questions, find_exhibits (AIC/Met/Cleveland) + add_exhibit; changes listed under each reply with undo; conversation saved with the class (last 40).
- UX round (Asit, Nov 2026): Home ("/") shows the next class to prepare, its status and one next action. Brief has class length (50/75/100/150 → slide count, activity slides) and a one-click "make my class" (research → slides with exhibits → fact-check; src/lib/make.ts, runs in the background, tab title shows progress). Slides are edited on the slide (click title; hover a picture to remove), extra tools behind "+ more". Fact-check runs quietly ~20s after edits. ⌘Z / undo in Prep; ← → between slides. Student handout page /handout/<id> (print → Save as PDF). Classes: drag to reorder (renumbers), "copy to…" another course. Search everything with ⌘K. Grey text darkened for readability; pictures carry alt text in PowerPoint.
- Fact-check (Asit, Nov 2026): decks are checked in batches of 4 slides side by side (api/check), so each fact gets enough web searches; a failed batch leaves its slides "not checked". Gentler since Nov 2026: only key facts (≤3 per slide), close matches count, sources the slide already carries (from research/museum records) count, and a cited page on an already-searched site counts. Unchecked/unverified never block "ready for class" (readiness.ok = has slides; readiness.clean = nothing to look at); only a ✗ asks one confirmation. Results are compact (components/Claims.tsx): one summary line ("✓ n checked · ? n unconfirmed · ✗ n to look at"), only ✗ facts shown with the suggested wording + "use this wording" (swaps it into the slide) / "it's fine"; everything else behind "details" (one source link each). The Checker page shows the full view. Fixes from the checker are just the corrected wording.
- Library (Asit, Nov 2026): no filter tabs — one list in four sections (Free textbooks · Museums & image collections · Through your libraries · Standard textbooks & journals), search box, "+ add a resource" opens in place (title + link; more fields folded), a "saved" tag next to stored books (click = open) and a "show only saved" toggle with the count; edit/remove appear on hover; "find in a library" (CPL, Internet Archive, JSTOR, WorldCat) only on standard textbooks/journals without a stored PDF.
- Textbook PDFs (Asit, Nov 2026): Library → "add a PDF" on books/journals/papers: upload from her computer (browser → private Vercel Blob, multipart for big files; api/blob/upload) or "save from a link" for open-licence PDFs (api/blob/fetch streams it in). Text is extracted (unpdf) and kept in /api/file so Prep's Textbook tool pulls points from a PDF page range (≤40 pages) of the stored copy, and research automatically uses the best-matching pages of her stored textbooks (src/lib/textbooks.ts bestPages, word stems) as a source, cited "Book, PDF p. N" linking to her copy at that page. Saving is a queue (src/lib/pdfQueue.ts): click save on many books or "save all free textbooks"; 2 at a time, keeps going while she browses, per-book status ("waiting… / saving… / couldn't save — try another link"), browser asks before closing the tab mid-save. Files are private (api/blob/file); only open-licence books or her own copies; share original links with students, not the stored file.
- Chat runs the deck (Asit, Nov 2026): tools show_slide, fact_check_slides, remake_slides, research_again, finish_class ("finish up" → check any unchecked slides, then mark ready). Actions run in Prep after the reply (onActions) and post a short follow-up message.
- Never lose work (Asit, Nov 2026): every list saves in the browser at once and online ~1s later, merged by id with the online copy (src/lib/merge.ts), unsaved edits remembered across reloads; long jobs (research/slides/review/check) keep their result on the server until the page collects it (src/lib/results.ts, /api/result); replaced research/slides/reviews kept as earlier versions (last 5, restorable); daily online backup kept 30 days (pine:backup:<list>:<date>).
- Asit finds small type hard to read: keep text about two points larger than her own site.
- Design (Asit, Nov 2026): match Tanya's own artist website — white page, Cormorant Garamond for
  everything (wordmark "pine studio" all one font, letterspaced, lower case), left-hand menu with
  lowercase links and courses listed under "classes", current page in grey, no boxes or borders,
  quiet underlined text buttons (main action in a hairline frame), photographs in full colour.
  "Darkroom" dark mode. Only ✗ errors get colour.

## Non-negotiable rules
1. **Fact-check everything; never make anything up** — in the app and in Claude's own work.
   Every fact traces to a source link that was actually retrieved; otherwise "unverified" / "not found".
   Separate sourced, inferred and assumed when reporting research. Example data is labelled.
2. **Make full use of free resources** (Asit, Nov 2026): open textbooks, museum open access,
   Smarthistory, Heilbrunn Timeline, Getty/Met free books, Artstor public collections, City Colleges
   of Chicago library and Chicago Public Library access. Prefer these before anything paid.
3. **Image rights:** public-domain images freely; in-copyright works only as museum previews,
   flagged "rights: check". Respect each source's terms (e.g. Getty Virtual Library: personal
   study only — link, don't redistribute).
   Exhibit sources (Asit, Nov 2026): Art Institute of Chicago, The Met, Cleveland (open access);
   Library of Congress (free to use only when the item's own record says "no known restrictions",
   otherwise "rights: check"); YouTube (official channels; linked/embedded, never downloaded;
   searched only on request because of the ~100 searches/day allowance shared with Silent Sheep).
4. Official APIs only; no scraping against a site's terms.
5. Never commit secrets.
