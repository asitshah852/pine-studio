// Starter Library. Every entry was checked by web search on 19 Nov 2026 (see "checked" notes).
// Access details (who qualifies, what a library subscribes to) change: each note says what to confirm.
import type { Resource } from "./types";

const at = "2026-11-19T00:00:00.000Z";
let n = 0;
const r = (x: Omit<Resource, "id" | "addedAt" | "starter">): Resource => ({ id: `starter-${++n}`, addedAt: at, starter: true, ...x });

export const STARTER_RESOURCES: Resource[] = [
  // ── Free & open textbooks ──────────────────────────────────────────────
  r({
    kind: "textbook",
    title: "Introduction to Art: Design, Context, and Meaning",
    author: "Pamela Sachant, Peggy Blood, Jeffery LeMieux, Rita Tekippe",
    year: "2016",
    publisher: "University of North Georgia Press (free, CC BY-SA)",
    url: "https://open.umn.edu/opentextbooks/textbooks/introduction-to-art-design-context-and-meaning-2016",
    topics: ["art appreciation", "elements & principles", "free textbook"],
    notes: "Free PDF written for an Art Appreciation course; 400+ images. A reviewer notes it is light on contemporary art. Also at oer.galileo.usg.edu/arts-textbooks/3.",
  }),
  r({
    kind: "textbook",
    title: "Reframing Art History",
    author: "Smarthistory (general editor Lauren Kilroy-Ewbank)",
    year: "2022–",
    publisher: "Smarthistory (free, Creative Commons non-commercial)",
    url: "https://smarthistory.org/?p=59717",
    topics: ["global art history", "free textbook"],
    notes: "Born-digital free textbook by 50+ experts; pick chapters in any order. Check the licence on each page before reusing images.",
  }),
  r({
    kind: "textbook",
    title: "A World Perspective of Art Appreciation",
    author: "Deborah Gustlin & Zoe Gustlin",
    publisher: "LibreTexts (free)",
    url: "https://human.libretexts.org/Bookshelves/Art/Art_Appreciation",
    topics: ["art appreciation", "global", "women artists", "free textbook"],
    notes: "World art prehistoric → modern with an emphasis on women artists. Licence shown as 'not declared' on one page: check before reusing.",
  }),
  r({
    kind: "textbook",
    title: "Art History (Boundless)",
    publisher: "LibreTexts / Lumen Learning (free, CC BY-SA 4.0)",
    url: "https://human.libretexts.org/Bookshelves/Art/Book%3A_Art_History_(Boundless)",
    topics: ["survey", "free textbook"],
    notes: "Intro survey, prehistory to modern. Reviews call it dated and uneven: use chapters as backup reading.",
  }),
  // ── Free scholarly sites & image collections ───────────────────────────
  r({
    kind: "website",
    title: "Smarthistory",
    author: "Beth Harris & Steven Zucker (founders)",
    url: "https://smarthistory.org",
    topics: ["videos", "essays", "global art history"],
    notes: "Free videos and essays by scholars; the same content powers Khan Academy's art history courses (khanacademy.org).",
  }),
  r({
    kind: "website",
    title: "Heilbrunn Timeline of Art History",
    publisher: "The Metropolitan Museum of Art",
    url: "https://metmuseum.org/essays/timeline-of-art-history",
    topics: ["essays", "chronologies"],
    notes: "1,000+ free essays and 300 chronologies by Met curators. Good citable source for slide facts.",
  }),
  r({
    kind: "museum",
    title: "Art Institute of Chicago — collection, open-access images & API",
    url: "https://www.artic.edu/collection",
    topics: ["Chicago", "images", "exhibits"],
    notes: "Public-domain images are free to use (Pine Studio's Exhibits search uses this). Free online scholarly catalogues (Monet, Renoir, Manet, Pissarro, Whistler…) at artic.edu/digital-publications.",
  }),
  r({
    kind: "museum",
    title: "Art Institute of Chicago — educator resources (Ryan Learning Center)",
    url: "https://www.artic.edu/ryan-learning-center",
    topics: ["Chicago", "teaching", "field trip"],
    notes: "Classroom resources and educator support. Free admission voucher is for Illinois educators (listed as pre-K–12, teaching artists, homeschool): ask whether college adjuncts qualify. Illinois residents also get free days (book online).",
  }),
  r({
    kind: "website",
    title: "Getty Publications Virtual Library",
    publisher: "J. Paul Getty Trust",
    url: "https://www.getty.edu/publications/virtuallibrary/",
    topics: ["free books", "photography", "conservation"],
    notes: "300+ Getty books free to read or download as PDF, incl. photography titles. Terms: private study, scholarship and research only (no redistribution, so link students to it rather than uploading PDFs).",
  }),
  r({
    kind: "website",
    title: "MetPublications (free full-text books)",
    publisher: "The Metropolitan Museum of Art",
    url: "https://www.metmuseum.org/met-publications",
    topics: ["free books", "catalogues"],
    notes: "Filter for books with full text online / free download.",
  }),
  r({
    kind: "website",
    title: "Artstor Public Collections (free, no login)",
    publisher: "JSTOR / ITHAKA",
    url: "https://www.artstor.org/public-collections/",
    topics: ["images", "teaching slides"],
    notes: "About 1.3M free images plus open museum images (incl. the Met's 400,000+). The core Artstor collections need a subscription — check the CCC library list.",
  }),
  r({
    kind: "website",
    title: "Library of Congress — Prints & Photographs Online Catalog",
    url: "https://www.loc.gov/pictures/",
    topics: ["photography", "American history", "images"],
    notes: "Millions of photographs and prints. Not everything is public domain: the rights line on each record says.",
  }),
  r({
    kind: "website",
    title: "National Gallery of Art — open-access images",
    url: "https://www.nga.gov/open-access-images.html",
    topics: ["images"],
    notes: "50,000+ images of public-domain works, free for any use, downloadable from each object page.",
  }),
  // ── Through her employers / city ───────────────────────────────────────
  r({
    kind: "other",
    title: "City Colleges of Chicago Libraries — databases by subject",
    url: "https://researchguides.ccc.edu/databasesbysubject",
    topics: ["JSTOR?", "articles", "ebooks", "faculty access"],
    notes: "TO CONFIRM: we couldn't see CCC's database list from here. Check the A–Z list for JSTOR, Artstor, Oxford Art Online (Grove), ProQuest/EBSCO and streaming video, and ask a CCC librarian (LibChat) about faculty off-campus login.",
  }),
  r({
    kind: "other",
    title: "Chicago Public Library — online resources (free card)",
    url: "https://www.chipublib.org/OnlineResources",
    topics: ["JSTOR", "EBSCO", "ebooks", "museum passes"],
    notes: "A Chicago library card is reported to include JSTOR and EBSCO databases, ebooks, and free museum passes (incl. Art Institute). Chicago residents can get an eCard online. Confirm the current list on the page.",
  }),
  // ── Standard texts (reference: confirm the edition she assigns) ────────
  r({ kind: "textbook", title: "Gardner's Art Through the Ages: A Global History", author: "Fred S. Kleiner", publisher: "Cengage", topics: ["survey"], notes: "Standard survey. Check CCC/CPL for a library copy before buying." }),
  r({ kind: "textbook", title: "Art History", author: "Marilyn Stokstad & Michael W. Cothren", publisher: "Pearson", topics: ["survey"], notes: "Standard survey." }),
  r({ kind: "textbook", title: "A World of Art", author: "Henry M. Sayre", publisher: "Pearson", topics: ["art appreciation"], notes: "Common Art Appreciation text." }),
  r({ kind: "textbook", title: "Living with Art", author: "Mark Getlein", publisher: "McGraw-Hill", topics: ["art appreciation"], notes: "Common Art Appreciation text." }),
  r({ kind: "paper", title: "Ways of Seeing", author: "John Berger", year: "1972", publisher: "BBC / Penguin", topics: ["visual culture", "theory"], notes: "Short, readable; the BBC series episodes are often assigned alongside." }),
  r({ kind: "paper", title: "On Photography", author: "Susan Sontag", year: "1977", topics: ["photography", "theory"], notes: "Essays; pairs well with a photography unit." }),
  // ── Journals ───────────────────────────────────────────────────────────
  r({ kind: "journal", title: "The Art Bulletin", publisher: "College Art Association", topics: ["scholarly"], notes: "Check JSTOR access via CCC or CPL." }),
  r({ kind: "journal", title: "Art Journal", publisher: "College Art Association", topics: ["modern & contemporary"], notes: "Check JSTOR access via CCC or CPL." }),
  r({ kind: "journal", title: "October", publisher: "MIT Press", topics: ["theory", "contemporary"], notes: "Check JSTOR access via CCC or CPL." }),
  r({ kind: "journal", title: "Aperture", publisher: "Aperture Foundation", topics: ["photography"], notes: "Photography magazine." }),
  r({ kind: "journal", title: "History of Photography", publisher: "Taylor & Francis", topics: ["photography", "scholarly"], notes: "Check CCC databases." }),
];

/** "Find a free copy" search links (searches, not facts). */
export function findLinks(title: string, author = ""): { label: string; url: string }[] {
  const q = encodeURIComponent(`${title} ${author}`.trim());
  const t = encodeURIComponent(title);
  return [
    { label: "Open Textbook Library", url: `https://open.umn.edu/opentextbooks/textbooks?term=${t}` },
    { label: "OER Commons", url: `https://oercommons.org/search?f.search=${t}` },
    { label: "Internet Archive (borrow)", url: `https://archive.org/search?query=${q}` },
    { label: "JSTOR", url: `https://www.jstor.org/action/doBasicSearch?Query=${q}` },
    { label: "Chicago Public Library", url: `https://chipublib.bibliocommons.com/v2/search?query=${q}&searchType=smart` },
    { label: "WorldCat (nearby libraries)", url: `https://search.worldcat.org/search?q=${q}` },
    { label: "Google Scholar", url: `https://scholar.google.com/scholar?q=${q}` },
  ];
}
