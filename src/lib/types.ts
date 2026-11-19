// Shared shapes for Pine Studio. Everything factual carries its sources.

export type Source = { title: string; url: string; note?: string };

export type Verdict = "supported" | "contradicted" | "unverified";

export type Claim = {
  text: string;
  verdict: Verdict;
  sources: Source[];
  fix?: string; // suggested correction when contradicted
  slideId?: string;
  confirmed?: boolean; // she checked it herself
};

export type Artwork = {
  museum: "Art Institute of Chicago" | "The Met" | "Cleveland Museum of Art" | "Library of Congress" | "YouTube";
  video?: { id: string; channel: string }; // YouTube: link and embed only, never downloaded
  id: string;
  title: string;
  artist: string;
  date: string;
  medium: string;
  dimensions?: string;
  place?: string;
  credit: string;
  url: string; // the museum's own object page (the source for every caption fact)
  imageUrl?: string; // only set for public-domain / open-access images
  thumbUrl?: string;
  publicDomain: boolean;
};

export type SlideImage = {
  url: string; // remote URL or data: URL for her own uploads
  credit: string;
  rights: "public-domain" | "own" | "check";
};

export type Slide = {
  id: string;
  layout: "title" | "artwork" | "text" | "compare";
  title: string;
  body: string; // bullet points, one per line
  notes: string; // speaker notes
  images: SlideImage[];
  artworks: Artwork[]; // museum records behind the images (the caption source)
  sources: Source[];
  check?: { at: string; claims: Claim[] };
  fromDeck?: boolean; // imported from her own PowerPoint (keeps its original notes)
};

export type Course = { id: string; name: string; example?: boolean };

export type Paragraph = { id: string; text: string; sources: Source[]; verified: boolean; edited?: boolean };

export type ExhibitSuggestion = {
  id: string;
  suggested: string; // what research suggested, e.g. "Georges Seurat, A Sunday on La Grande Jatte (1884)"
  why: string; // why it fits the class (a teaching suggestion, not a fact)
  match?: Artwork; // the museum record it matched, if found in an open collection
  use: boolean; // her choice: use in the slides
};

export type ResearchDoc = {
  at: string;
  overview: string; // framing, no facts
  sections: { id: string; heading: string; paragraphs: Paragraph[] }[];
  questions: string[];
  exhibits: ExhibitSuggestion[];
};

export type Material = {
  id: string;
  name: string; // file name
  kind: "pptx" | "pdf" | "docx" | "text" | "image";
  fileId?: string; // full extracted text, kept in file storage (/api/file/<id>)
  preview: string; // first few hundred characters
  slides?: number; // slides imported from it (pptx)
  at: string;
};

export type Suggestion = {
  id: string;
  kind: "accuracy" | "content" | "discussion" | "exhibit" | "structure" | "clarity";
  slideId?: string; // which slide it is about, if any
  text: string; // what to change and why
  change?: { title?: string; body?: string; notes?: string }; // proposed new wording for that slide
  newSlide?: { title: string; body: string; notes: string }; // or a slide to add after it
  sources: Source[];
  verified: boolean; // a factual suggestion with a retrieved source
  status: "open" | "applied" | "dismissed";
};

export type ReviewDoc = {
  at: string;
  summary: string; // overall read of the class (opinion, no facts)
  suggestions: Suggestion[];
  questions: string[]; // new discussion points
  exhibits: ExhibitSuggestion[];
};

export type Version = {
  id: string;
  kind: "research" | "slides" | "review";
  at: string; // when it was replaced
  label: string; // e.g. "research from 19 Nov, 14:02"
  research?: ResearchDoc;
  slides?: Slide[];
  review?: ReviewDoc;
};

export type ChatOp =
  | { op: "edit_slide"; label: string; slideId: string; title?: string; body?: string; layout?: Slide["layout"] }
  | { op: "add_slide"; label: string; afterId?: string; title: string; body: string; layout?: Slide["layout"] }
  | { op: "delete_slide"; label: string; slideId: string }
  | { op: "move_slide"; label: string; slideId: string; to: number }
  | { op: "edit_paragraph"; label: string; paragraphId: string; text: string }
  | { op: "add_paragraph"; label: string; sectionId?: string; heading?: string; text: string; sources: Source[]; verified: boolean }
  | { op: "add_question"; label: string; text: string }
  | { op: "add_exhibit"; label: string; artwork: Artwork; why: string; slideId?: string }
  // Actions the page carries out after the reply (they change nothing by themselves):
  | { op: "goto_slide"; label: string; slideId: string }
  | { op: "run_check"; label: string }
  | { op: "run_slides"; label: string; count?: number }
  | { op: "run_research"; label: string }
  | { op: "finish"; label: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  at: string;
  sources?: Source[]; // pages Claude cited in its reply
  ops?: string[]; // what it changed (labels)
  undo?: { slides: Slide[]; research?: ResearchDoc }; // kept on the latest change only
  undone?: boolean;
};

export type Lesson = {
  id: string;
  courseId: string;
  number: number; // class number within the course
  topic: string;
  premise: string; // her angle / what the class is about
  minutes?: number; // class length (50 / 75 / 150)
  research?: ResearchDoc;
  materials?: Material[]; // files she uploaded (her existing class materials)
  review?: ReviewDoc; // "suggest improvements"
  chat?: ChatMessage[]; // "talk it through" conversation (last 40)
  versions?: Version[]; // earlier research / slides / reviews, newest first (restore from Prep)
  readings: string[]; // resource ids
  slides: Slide[];
  status: "draft" | "ready";
  readyAt?: string;
  checkedAt?: string;
  example?: boolean;
  // older fields (kept so saved data still loads)
  date?: string;
  unit?: string;
  summary?: string;
};

export type ResourceKind = "textbook" | "journal" | "paper" | "museum" | "website" | "video" | "other";

export type Resource = {
  id: string;
  kind: ResourceKind;
  title: string;
  author?: string;
  year?: string;
  publisher?: string;
  url?: string;
  topics: string[];
  notes: string;
  starter?: boolean; // from the starter list: confirm the edition she assigns
  pdf?: { path: string; name: string; size: number; pages?: number; textId?: string }; // her own copy (private storage)
  addedAt: string;
};

export type TextbookPoint = { text: string; quote?: string; page?: string };

export type FeedbackItem = { id: string; tab: string; text: string; at: string; done?: boolean };
