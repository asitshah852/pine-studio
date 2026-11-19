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

export type Lesson = {
  id: string;
  number: number; // class / week number
  date?: string; // yyyy-mm-dd
  topic: string;
  unit?: string; // e.g. "Renaissance", "Photography"
  summary: string;
  readings: string[]; // resource ids
  slides: Slide[];
  status: "draft" | "ready";
  readyAt?: string;
  checkedAt?: string;
  example?: boolean;
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

export type Research = {
  topic: string;
  at: string;
  overview: string;
  points: { heading: string; text: string; sources: Source[]; verified: boolean }[];
  artworks: string[]; // suggested works to look up in Exhibits
  questions: string[]; // discussion questions for class
};

export type TextbookPoint = { text: string; quote?: string; page?: string };

export type FeedbackItem = { id: string; tab: string; text: string; at: string; done?: boolean };
