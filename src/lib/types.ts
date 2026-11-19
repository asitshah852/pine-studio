// Shared shapes for Pine Studio. Everything factual carries its sources.

export type Source = { title: string; url: string; note?: string };

export type Verdict = "supported" | "contradicted" | "unverified";

export type Claim = {
  text: string;
  verdict: Verdict;
  sources: Source[];
  fix?: string; // suggested correction when contradicted
  slideId?: string;
};

export type Artwork = {
  museum: "Art Institute of Chicago" | "The Met" | "Cleveland Museum of Art";
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

export type Lesson = {
  id: string;
  courseId: string;
  number: number; // class number within the course
  topic: string;
  premise: string; // her angle / what the class is about
  research?: ResearchDoc;
  materials?: Material[]; // files she uploaded (her existing class materials)
  review?: ReviewDoc; // "suggest improvements"
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
  addedAt: string;
};

export type TextbookPoint = { text: string; quote?: string; page?: string };

export type FeedbackItem = { id: string; tab: string; text: string; at: string; done?: boolean };
