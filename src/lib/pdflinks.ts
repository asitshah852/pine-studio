// Finding a book's PDF download link on its web page (used by "save a PDF copy").
/** Links on a page that look like its PDF download, best guesses first. */
export function pdfLinks(html: string, base: string): string[] {
  const out: { url: string; score: number }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].replace(/&amp;/g, "&");
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let score = 0;
    if (/\.pdf($|[?#])/i.test(href)) score += 3;
    if (/\bpdf\b/i.test(label)) score += 3;
    if (/download/i.test(label) || /download/i.test(href)) score += 1;
    if (/viewcontent\.cgi|\/formats\/|\/download\//i.test(href)) score += 1;
    if (/epub|mobi|odt|docx?|xml|html?\b/i.test(label)) score -= 2;
    if (score < 3) continue;
    try {
      out.push({ url: new URL(href, base).toString(), score });
    } catch {
      /* skip a broken link */
    }
  }
  return [...new Map(out.sort((a, b) => b.score - a.score).map((x) => [x.url, x])).keys()].slice(0, 5);
}

