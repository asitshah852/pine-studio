// Finding a book's PDF download link on its web page (used by "save a PDF copy").

/** Links on a page that look like its PDF download, best guesses first (score ≥ 3 = likely the PDF itself). */
export function pdfLinks(html: string, base: string): string[] {
  return scored(html, base).filter((x) => x.score >= 3).map((x) => x.url).slice(0, 5);
}

/** Links worth following one step further (e.g. a "PDF" format link that leads to the publisher's page). */
export function nextPages(html: string, base: string): string[] {
  return scored(html, base).filter((x) => x.score >= 1 && x.score < 3).map((x) => x.url).slice(0, 4);
}

function scored(html: string, base: string): { url: string; score: number }[] {
  const out: { url: string; score: number }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1].replace(/&amp;/g, "&");
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let score = 0;
    if (/\.pdf($|[?#])/i.test(href)) score += 3;
    if (/\bpdf\b/i.test(label)) score += 3;
    if (/viewcontent\.cgi/i.test(href)) score += 3; // Digital Commons / bepress "Download" = the PDF
    if (/download/i.test(label) || /download/i.test(href)) score += 1;
    if (/\/formats\/|\/download\//i.test(href)) score += 1;
    if (/epub|mobi|odt|docx?|xml|html?\b|kindle/i.test(label)) score -= 2;
    if (score < 1) continue;
    try {
      const url = new URL(href, base).toString();
      if (!/^https:/.test(url)) continue;
      out.push({ url, score });
    } catch {
      /* skip a broken link */
    }
  }
  return [...new Map(out.sort((a, b) => b.score - a.score).map((x) => [x.url, x])).values()];
}
