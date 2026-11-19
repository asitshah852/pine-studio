// Exhibit search: the Art Institute of Chicago and The Met open-access APIs (no key needed).
// Caption facts (title, artist, date, medium, credit line) come straight from the museum record,
// and every artwork links to its museum page. Images are only offered for public-domain works.
import type { Artwork } from "./types";

const UA = { "User-Agent": "PineStudio/0.1 (teaching tool)", "AIC-User-Agent": "PineStudio/0.1 (teaching tool)" };

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

export async function searchAIC(q: string, limit = 18): Promise<Artwork[]> {
  const fields = [
    "id", "title", "artist_display", "artist_title", "date_display", "medium_display",
    "dimensions", "place_of_origin", "credit_line", "image_id", "is_public_domain",
  ].join(",");
  const url = `https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(q)}&fields=${fields}&limit=${limit}`;
  const r = await fetch(url, { headers: UA, next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(`Art Institute search failed (${r.status})`);
  const j = (await r.json()) as { data?: Record<string, unknown>[]; config?: { iiif_url?: string } };
  const iiif = j.config?.iiif_url || "https://www.artic.edu/iiif/2";
  return (j.data ?? []).map((a) => {
    const pd = a.is_public_domain === true;
    const img = typeof a.image_id === "string" && a.image_id ? a.image_id : "";
    return {
      museum: "Art Institute of Chicago" as const,
      id: String(a.id),
      title: clean(a.title) || "Untitled",
      artist: clean(a.artist_display) || clean(a.artist_title) || "Unknown artist",
      date: clean(a.date_display),
      medium: clean(a.medium_display),
      dimensions: clean(a.dimensions) || undefined,
      place: clean(a.place_of_origin) || undefined,
      credit: clean(a.credit_line),
      url: `https://www.artic.edu/artworks/${a.id}`,
      publicDomain: pd,
      imageUrl: pd && img ? `${iiif}/${img}/full/1686,/0/default.jpg` : undefined,
      thumbUrl: img ? `${iiif}/${img}/full/400,/0/default.jpg` : undefined,
    };
  });
}

export async function searchMet(q: string, limit = 12): Promise<Artwork[]> {
  const s = await fetch(
    `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(q)}`,
    { headers: UA, next: { revalidate: 3600 } },
  );
  if (!s.ok) throw new Error(`Met search failed (${s.status})`);
  const ids = (((await s.json()) as { objectIDs?: number[] | null }).objectIDs ?? []).slice(0, limit);
  const objs = await Promise.all(
    ids.map(async (id) => {
      try {
        const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
          headers: UA,
          next: { revalidate: 86400 },
        });
        return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }),
  );
  return objs
    .filter((o): o is Record<string, unknown> => !!o && !!o.objectID)
    .map((o) => {
      const pd = o.isPublicDomain === true;
      const artist = [clean(o.artistDisplayName), clean(o.artistDisplayBio) && `(${clean(o.artistDisplayBio)})`]
        .filter(Boolean)
        .join(" ");
      return {
        museum: "The Met" as const,
        id: String(o.objectID),
        title: clean(o.title) || "Untitled",
        artist: artist || clean(o.culture) || "Unknown artist",
        date: clean(o.objectDate),
        medium: clean(o.medium),
        dimensions: clean(o.dimensions) || undefined,
        place: clean(o.country) || clean(o.culture) || undefined,
        credit: clean(o.creditLine),
        url: clean(o.objectURL) || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
        publicDomain: pd,
        imageUrl: pd ? clean(o.primaryImage) || undefined : undefined,
        thumbUrl: clean(o.primaryImageSmall) || undefined,
      };
    });
}

export async function searchCleveland(q: string, limit = 12): Promise<Artwork[]> {
  const r = await fetch(
    `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(q)}&has_image=1&limit=${limit}`,
    { headers: UA, next: { revalidate: 3600 } },
  );
  if (!r.ok) throw new Error(`Cleveland search failed (${r.status})`);
  const j = (await r.json()) as { data?: Record<string, any>[] };
  return (j.data ?? []).map((o) => {
    const pd = o.share_license_status === "CC0";
    const web = clean(o.images?.web?.url);
    return {
      museum: "Cleveland Museum of Art" as const,
      id: String(o.id),
      title: clean(o.title) || "Untitled",
      artist: (o.creators ?? []).map((c: { description?: string }) => clean(c.description)).filter(Boolean).join("; ") || clean(o.culture?.[0]) || "Unknown artist",
      date: clean(o.creation_date),
      medium: clean(o.technique),
      dimensions: clean(o.measurements) || undefined,
      place: clean(o.culture?.[0]) || undefined,
      credit: clean(o.creditline),
      url: clean(o.url) || `https://www.clevelandart.org/art/${o.accession_number}`,
      publicDomain: pd,
      imageUrl: pd ? clean(o.images?.print?.url) || web || undefined : undefined,
      thumbUrl: web || undefined,
    };
  });
}

/** The caption line used on slides, built only from the museum record. */
export function caption(a: Artwork): string {
  const bits = [a.artist, `${a.title}${a.date ? `, ${a.date}` : ""}`, a.medium, `${a.museum}${a.credit ? `. ${a.credit}` : ""}`];
  return bits.filter(Boolean).join(". ").replace(/\.\./g, ".");
}

// Hosts the image proxy will fetch from (so slides can embed museum images in .pptx).
export const IMAGE_HOSTS = ["artic.edu", "www.artic.edu", "images.metmuseum.org", "collectionapi.metmuseum.org", "openaccess-cdn.clevelandart.org"];

// ── Matching a suggested work ("Artist, Title (date)") to a real museum record ──
const STOP = new Set(["the", "a", "an", "of", "and", "in", "on", "at", "la", "le", "les", "de", "du", "des", "el", "with", "to", "for"]);
const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** True when the record's title covers most of the suggested title and the artist's surname matches. */
export function isMatch(rec: Artwork, title: string, artist: string): boolean {
  const want = words(title);
  if (!want.length) return false;
  const have = new Set(words(rec.title));
  const hit = want.filter((w) => have.has(w)).length / want.length;
  if (hit < 0.6) return false;
  const surname = words(artist).pop();
  if (!surname || /unknown|anonymous/.test(artist.toLowerCase())) return true;
  return words(rec.artist).includes(surname);
}

/** Look a suggestion up in Chicago, then the Met, then Cleveland. Returns the first good match. */
export async function findWork(title: string, artist: string): Promise<Artwork | undefined> {
  const q = `${title} ${artist}`.trim();
  const tries: (() => Promise<Artwork[]>)[] = [() => searchAIC(q, 8), () => searchMet(q, 4), () => searchCleveland(q, 6)];
  for (const t of tries) {
    try {
      const hit = (await t()).find((r) => isMatch(r, title, artist));
      if (hit) return hit;
    } catch {
      /* try the next museum */
    }
  }
  return undefined;
}
